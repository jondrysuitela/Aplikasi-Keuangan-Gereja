type PrintOrientation = 'portrait' | 'landscape';

type PrintOptions = {
  title?: string;
  paper?: string;
  customWidthMm?: number;
  customHeightMm?: number;
  orientation?: PrintOrientation;
  marginMm?: number;
  scale?: number;
  styleId?: string;
};

export function printWithPageSetup(options: PrintOptions = {}) {
  const {
    title,
    paper = '',
    customWidthMm,
    customHeightMm,
    orientation = 'portrait',
    marginMm = 10,
    scale = 1,
    styleId = 'app-print-page-setup',
  } = options;

  document.getElementById(styleId)?.remove();
  const customSize = Number(customWidthMm) > 0 && Number(customHeightMm) > 0
    ? `${Number(customWidthMm)}mm ${Number(customHeightMm)}mm`
    : '';
  const pageSize = customSize || (paper ? `${paper} ${orientation}` : orientation);

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @media print {
      @page {
        size: ${pageSize};
        margin: ${Number(marginMm) || 10}mm;
      }

      .print-target {
        zoom: ${Number(scale) || 1};
      }

      .print-target table {
        page-break-inside: auto;
      }

      .print-target tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
    }
  `;
  document.head.appendChild(style);

  const previousTitle = document.title;
  if (title) document.title = title;

  const cleanup = () => {
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
    window.setTimeout(() => document.getElementById(styleId)?.remove(), 300);
  };

  window.addEventListener('afterprint', cleanup);
  window.setTimeout(() => window.print(), 80);
}
