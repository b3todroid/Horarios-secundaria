import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { RecognitionResult, RecognizedTeacher } from '../api/types';
import { Alert, Loading, PageHeader } from '../components/common';
import { ImportReview, emptyTeacher } from '../components/ImportReview';
import { loadImage, noCrop, processPage, renderPage, type Crop, type PageImage } from '../lib/image';
import { useLoad } from '../lib/useLoad';
import { usePid } from '../state/project';
import { useUi } from '../state/ui';

let seq = 0;

function Editor({ page, onChange }: { page: PageImage; onChange: (p: PageImage) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(page.url)
      .then((img) => {
        if (!alive || !canvasRef.current) return;
        const out = renderPage(img, page.rotation, page.crop, 900);
        const c = canvasRef.current;
        c.width = out.width;
        c.height = out.height;
        c.getContext('2d')?.drawImage(out, 0, 0);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [page]);

  const setCrop = (k: keyof Crop, v: number) => onChange({ ...page, crop: { ...page.crop, [k]: v } });
  const rotate = (d: number) => onChange({ ...page, rotation: (((page.rotation + d) % 360) + 360) % 360 as PageImage['rotation'] });
  const labels: Record<keyof Crop, string> = { top: 'Recortar arriba', bottom: 'Recortar abajo', left: 'Recortar izquierda', right: 'Recortar derecha' };

  return (
    <div className="grid-2">
      <div className="image-frame">
        {error ? <Alert kind="error">{error}</Alert> : <canvas ref={canvasRef} aria-label={`Vista previa de ${page.name}`} role="img" />}
      </div>
      <div className="stack">
        <div className="row">
          <button type="button" className="btn" onClick={() => rotate(-90)}>
            ↺ Girar a la izquierda
          </button>
          <button type="button" className="btn" onClick={() => rotate(90)}>
            ↻ Girar a la derecha
          </button>
        </div>
        {(Object.keys(labels) as (keyof Crop)[]).map((k) => (
          <label key={k} className="field">
            <span>
              {labels[k]}: {page.crop[k]}%
            </span>
            <input type="range" min={0} max={45} value={page.crop[k]} onChange={(e) => setCrop(k, Number(e.target.value))} />
          </label>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => onChange({ ...page, crop: noCrop, rotation: 0 })}>
          Restablecer imagen
        </button>
      </div>
    </div>
  );
}

export default function ImportPhoto() {
  const pid = usePid();
  const navigate = useNavigate();
  const { toast } = useUi();
  const meta = useLoad(async () => {
    const [providers, periods, teachers] = await Promise.all([api.visionProviders(), api.periods(pid), api.teachers(pid)]);
    return { providers, periods, teachers };
  }, [pid]);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [provider, setProvider] = useState('demo');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ result: RecognitionResult; images: string[] } | null>(null);
  const [over, setOver] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const configured = meta.data?.providers.find((p) => p.configured && p.id !== 'demo');
    if (configured) setProvider(configured.id);
  }, [meta.data]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (imgs.length < files.length) toast('Algunos archivos no son imágenes y se ignoraron.', 'info');
    const added = imgs.map((f) => ({ id: `p${++seq}`, name: f.name || `Foto ${seq}`, url: URL.createObjectURL(f), rotation: 0 as const, crop: noCrop }));
    setPages((ps) => [...ps, ...added]);
    if (added[0]) setCurrent(added[0].id);
  };

  const nextCode = () => {
    const nums = (meta.data?.teachers ?? []).map((t) => Number(/(\d+)$/.exec(t.code)?.[1] ?? 0));
    return `M${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
  };

  const process = async () => {
    if (!pages.length) return;
    setProcessing(true);
    setError(null);
    try {
      const processed = await Promise.all(pages.map(processPage));
      const result = await api.recognize(provider, processed.map((p) => p.blob));
      result.teachers = result.teachers.map((t) => ({ ...t, code: t.code || nextCode() }));
      setReview({ result, images: processed.map((p) => p.previewUrl) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const manual = () => {
    setReview({
      result: {
        provider: 'manual',
        provider_label: 'Captura manual',
        pages: 0,
        teachers: [emptyTeacher(nextCode())],
        overall_confidence: 1,
        warnings: [],
      },
      images: pages.map((p) => p.url),
    });
  };

  const confirm = async (teachers: RecognizedTeacher[]) => {
    const r = await api.confirmImport(pid, teachers);
    const parts = [
      r.teachers.length && `${r.teachers.length} maestros nuevos`,
      r.updated_teachers.length && `${r.updated_teachers.length} actualizados`,
      r.assignments && `${r.assignments} asignaciones`,
      r.groups.length && `grupos creados: ${r.groups.join(', ')}`,
      r.subjects.length && `materias creadas: ${r.subjects.join(', ')}`,
    ].filter(Boolean);
    toast(`Importación completa: ${parts.join('; ')}.`);
    setReview(null);
    setPages([]);
    navigate('/carga');
  };

  if (meta.loading && !meta.data) return <Loading />;
  if (meta.error || !meta.data) return <Alert kind="error">{meta.error}</Alert>;

  if (review)
    return (
      <>
        <PageHeader title="Revisar datos reconocidos" description="Compara con la imagen y corrige lo necesario antes de importar." />
        <ImportReview
          result={review.result}
          images={review.images}
          periods={meta.data.periods}
          onConfirm={confirm}
          onCancel={() => setReview(null)}
        />
      </>
    );

  const page = pages.find((p) => p.id === current);
  const anyAi = meta.data.providers.some((p) => p.configured && p.id !== 'demo');

  return (
    <>
      <PageHeader
        title="Importar carga horaria"
        description="Toma una fotografía del formato de carga horaria o elige imágenes guardadas. Después revisarás y corregirás los datos antes de guardarlos."
        actions={
          <button type="button" className="btn" onClick={manual}>
            Captura manual
          </button>
        }
      />
      {!anyAi && (
        <Alert kind="info" title="Sin reconocimiento con IA configurado">
          No hay claves de OpenAI o Anthropic en el servidor. Puedes usar el proveedor de demostración para practicar o la
          captura manual. Consulta el README para activar la IA.
        </Alert>
      )}

      <section className="card" aria-labelledby="paso-fotos">
        <h2 id="paso-fotos">1. Agrega las páginas</h2>
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <p>Arrastra imágenes aquí o usa los botones.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => cameraRef.current?.click()}>
              📷 Tomar fotografía
            </button>
            <button type="button" className="btn btn-lg" onClick={() => filesRef.current?.click()}>
              🖼 Elegir imágenes
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={filesRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="file-input"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {pages.length > 0 && (
          <div className="thumbs" style={{ marginTop: '1rem' }}>
            {pages.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" className="thumb" aria-pressed={p.id === current} onClick={() => setCurrent(p.id)}>
                  <img src={p.url} alt="" style={{ transform: `rotate(${p.rotation}deg)` }} />
                  <span>Página {i + 1}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setPages(pages.filter((x) => x.id !== p.id));
                    if (current === p.id) setCurrent(null);
                  }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {page && (
        <section className="card" aria-labelledby="paso-editar">
          <h2 id="paso-editar">2. Recorta o gira la imagen</h2>
          <Editor page={page} onChange={(np) => setPages(pages.map((p) => (p.id === np.id ? np : p)))} />
        </section>
      )}

      {pages.length > 0 && (
        <section className="card" aria-labelledby="paso-procesar">
          <h2 id="paso-procesar">3. Procesa las imágenes</h2>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ minWidth: 280 }}>
              <span>Proveedor de reconocimiento</span>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {meta.data.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.label}
                    {p.configured ? '' : ' (sin clave configurada)'}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary btn-lg" onClick={process} disabled={processing}>
              {processing ? 'Procesando…' : `Procesar ${pages.length === 1 ? '1 página' : `${pages.length} páginas`}`}
            </button>
          </div>
          {processing && <Loading text="Reconociendo el formato. Puede tardar hasta un minuto…" />}
        </section>
      )}
    </>
  );
}
