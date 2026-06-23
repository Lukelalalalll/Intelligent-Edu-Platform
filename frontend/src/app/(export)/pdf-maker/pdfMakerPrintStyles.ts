export const PDF_PRINT_STYLE = `
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
  }

  #presentation-slides-wrapper {
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    gap: 0 !important;
  }

  #presentation-slides-wrapper .slides-export-stack {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  #presentation-slides-wrapper .main-slide {
    width: 1280px !important;
    min-width: 1280px !important;
    max-width: 1280px !important;
    height: 720px !important;
    min-height: 720px !important;
    max-height: 720px !important;
    flex: 0 0 720px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  #presentation-slides-wrapper .slide-export-inner {
    width: 1280px !important;
    height: 720px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  @media print {
    .export-runtime-alert {
      display: none !important;
    }

    @page {
      size: 1280px 720px;
      margin: 0;
    }

    #presentation-slides-wrapper {
      overflow: visible !important;
    }

    #presentation-slides-wrapper .main-slide {
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    #presentation-slides-wrapper .main-slide:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  }
`;
