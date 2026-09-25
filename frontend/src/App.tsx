import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alert, Loading } from './components/common';
import { ProjectProvider, useProject } from './state/project';
import { SaveStatusProvider } from './state/save';
import { UiProvider } from './state/ui';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Teachers from './pages/Teachers';
import Groups from './pages/Groups';
import Subjects from './pages/Subjects';
import Workload from './pages/Workload';
import Availability from './pages/Availability';
import ImportPhoto from './pages/ImportPhoto';
import Generate from './pages/Generate';
import Results from './pages/Results';
import ExportPage from './pages/Export';
import Backups from './pages/Backups';

function Routed() {
  const { current, loading, error, refresh } = useProject();
  if (loading) return <Loading text="Conectando con el servidor…" />;
  if (error || !current)
    return (
      <Alert kind="error" title="No se pudo cargar la información">
        <p>{error ?? 'No hay proyectos.'}</p>
        <p>Verifica que el backend esté encendido (consulta el README).</p>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Reintentar
        </button>
      </Alert>
    );
  return (
    <Routes key={current.id}>
      <Route path="/" element={<Home />} />
      <Route path="/configuracion" element={<Settings />} />
      <Route path="/maestros" element={<Teachers />} />
      <Route path="/grupos" element={<Groups />} />
      <Route path="/materias" element={<Subjects />} />
      <Route path="/carga" element={<Workload />} />
      <Route path="/disponibilidad" element={<Availability />} />
      <Route path="/importar" element={<ImportPhoto />} />
      <Route path="/generar" element={<Generate />} />
      <Route path="/resultados" element={<Results />} />
      <Route path="/exportar" element={<ExportPage />} />
      <Route path="/respaldos" element={<Backups />} />
      <Route path="*" element={<Alert kind="warn" title="Página no encontrada">Usa el menú para navegar.</Alert>} />
    </Routes>
  );
}

export default function App() {
  return (
    <UiProvider>
      <SaveStatusProvider>
        <ProjectProvider>
          <Layout>
            <Routed />
          </Layout>
        </ProjectProvider>
      </SaveStatusProvider>
    </UiProvider>
  );
}
