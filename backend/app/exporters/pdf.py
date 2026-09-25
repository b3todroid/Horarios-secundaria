"""Exportación a PDF tamaño carta con letra grande."""
from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import landscape, letter, portrait
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table as RLTable, TableStyle

from .common import Table


def _esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")


def render_pdf(tables: list[Table], orientation: str = "landscape") -> bytes:
    size = landscape(letter) if orientation == "landscape" else portrait(letter)
    buf = BytesIO()
    margin = 1.2 * cm
    doc = SimpleDocTemplate(buf, pagesize=size, leftMargin=margin, rightMargin=margin,
                            topMargin=margin, bottomMargin=margin, title="Horarios")
    base = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=base["Title"], fontSize=20, leading=24, spaceAfter=4)
    subtitle = ParagraphStyle("st", parent=base["Normal"], fontSize=12, leading=15, alignment=TA_CENTER,
                              textColor=colors.HexColor("#444444"))
    width = size[0] - 2 * margin
    height = size[1] - 2 * margin - 2.4 * cm

    story = []
    for i, t in enumerate(tables):
        ncols = len(t.header)
        nrows = len(t.rows) + 1
        # Letra grande: se reduce solo si hay muchas columnas o filas.
        font = 13 if ncols <= 6 else max(8, 13 - (ncols - 6))
        if nrows > 8:
            font = min(font, 12)
        cell = ParagraphStyle("c", parent=base["Normal"], fontSize=font, leading=font * 1.2, alignment=TA_CENTER)
        head = ParagraphStyle("h", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
        first_w = 2.6 * cm
        other_w = (width - first_w) / max(1, ncols - 1)
        data = [[Paragraph(_esc(h), head) for h in t.header]]
        for r in t.rows:
            data.append([Paragraph(_esc(c), cell) if c else "" for c in r])
        row_h = min(2.6 * cm, height / nrows)
        tbl = RLTable(data, colWidths=[first_w] + [other_w] * (ncols - 1),
                      rowHeights=[1.1 * cm] + [row_h] * (nrows - 1), repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3a5f")),
            ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#e8edf5")),
            ("GRID", (0, 0), (-1, -1), 0.8, colors.HexColor("#5b6b80")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        story += [Paragraph(_esc(t.title), title), Paragraph(_esc(t.subtitle), subtitle), Spacer(1, 0.3 * cm), tbl]
        if i < len(tables) - 1:
            story.append(PageBreak())
    if not story:
        story.append(Paragraph("No hay horarios para exportar.", title))
    doc.build(story)
    return buf.getvalue()
