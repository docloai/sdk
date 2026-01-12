/**
 * Inline Components for Browser-Side JSX Rendering
 *
 * These are simplified, standalone versions of document block components
 * that can run in a browser with just React from CDN (no build step).
 *
 * The generated JavaScript is embedded directly in the HTML page,
 * allowing Puppeteer to render documents without a server.
 *
 * Key components:
 * - Document: The root container (850x1200px, A4 aspect)
 * - Field: Data fields with optional bounding box tracking (fieldId prop)
 * - Table/TableRow/TableCell: Tabular data
 * - SignatureBlock/SignatureText: Signature areas with handwriting fonts
 * - Logo, Barcode, QRCode: Visual elements
 */

// Theme values embedded directly (from theme.ts)
const theme = {
  colors: {
    text: { primary: '#1a1a1a', secondary: '#4a4a4a', muted: '#6b7280', accent: '#2563eb' },
    background: { page: '#ffffff', header: '#f8fafc', alternate: '#f1f5f9' },
    border: { light: '#e5e7eb', medium: '#d1d5db', heavy: '#1a1a1a' },
  },
  typography: {
    // Print-appropriate sizes (72 DPI: 1pt = 1px)
    // xs=8pt fine print, sm=9pt labels, base=10pt body, md=11pt, lg=12pt section headers, xl=14pt headers, 2xl=18pt title, 3xl=22pt
    sizes: { xs: 8, sm: 9, base: 10, md: 11, lg: 12, xl: 14, '2xl': 18, '3xl': 22 },
    weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights: { tight: 1.2, normal: 1.4, relaxed: 1.6 },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 },
  borders: { radius: { none: 0, sm: 2, md: 4, lg: 8 } },
};

/**
 * Generate all component definitions as a JavaScript string
 * that can be embedded in a browser script tag
 */
export function generateInlineComponents(): string {
  return `
// =============================================================================
// THEME CONSTANTS
// =============================================================================
const theme = ${JSON.stringify(theme, null, 2)};

const getSpacing = (size) => typeof size === 'number' ? size : (theme.spacing[size] || 16);
const getFontSize = (size) => typeof size === 'number' ? size : (theme.typography.sizes[size] || 14);
const getFontWeight = (weight) => theme.typography.weights[weight] || 400;
const getTextColor = (color) => theme.colors.text[color] || color || theme.colors.text.primary;
const getJustify = (j) => ({ start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }[j] || j);
const getAlign = (a) => ({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }[a] || a);

// =============================================================================
// LAYOUT COMPONENTS
// =============================================================================

function Document({ width = 612, height = 792, padding = 32, background = '#fff', children, style = {} }) {
  // Outer container: fixed at 0,0, no padding (prevents offset issues)
  // Inner container: provides the actual content padding
  return React.createElement('div', {
    className: 'd-document',
    style: {
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: theme.typography.sizes.base, lineHeight: 1.4, color: theme.colors.text.primary,
      backgroundColor: background,
      ...style,
      // Critical: these MUST come after ...style to prevent LLM overrides
      width: 850, height: 1200, boxSizing: 'border-box', // A4 aspect ratio
      position: 'absolute', top: 0, left: 0, overflow: 'hidden',
      padding: 0, // Outer container has NO padding
    }
  }, React.createElement('div', {
    className: 'd-document-inner',
    style: {
      width: '100%', height: '100%', boxSizing: 'border-box',
      padding: padding, // Inner container has the content padding
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column', // Flex column so children fill width
    }
  }, children));
}

function Row({ gap = 'md', justify = 'start', align = 'start', wrap = false, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-row',
    style: {
      display: 'flex', flexDirection: 'row',
      gap: getSpacing(gap),
      justifyContent: getJustify(justify),
      alignItems: getAlign(align),
      flexWrap: wrap ? 'wrap' : 'nowrap',
      width: '100%',
      maxWidth: '100%',
      ...style
    }
  }, children);
}

function Column({ flex, width, align, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-column',
    style: {
      flex: flex ?? (width ? undefined : 1),
      width,
      minWidth: 0,
      maxWidth: '100%',
      alignSelf: align ? getAlign(align) : undefined,
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      ...style
    }
  }, children);
}

function Section({ spacing = 'md', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-section',
    style: { width: '100%', marginBottom: getSpacing(spacing), ...style }
  }, children);
}

function Stack({ gap = 'sm', align = 'stretch', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-stack',
    style: {
      display: 'flex', flexDirection: 'column',
      width: '100%',
      gap: getSpacing(gap),
      alignItems: getAlign(align),
      ...style
    }
  }, children);
}

function Grid({ columns = 2, rows, gap = 'md', columnGap, rowGap, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-grid',
    style: {
      display: 'grid',
      width: '100%',
      gridTemplateColumns: typeof columns === 'number' ? \`repeat(\${columns}, 1fr)\` : columns,
      gridTemplateRows: rows ? (typeof rows === 'number' ? \`repeat(\${rows}, auto)\` : rows) : undefined,
      gap: getSpacing(gap),
      columnGap: columnGap ? getSpacing(columnGap) : undefined,
      rowGap: rowGap ? getSpacing(rowGap) : undefined,
      ...style
    }
  }, children);
}

function Box({ padding, margin, background, border, borderRadius, children, style = {} }) {
  // Print-style box: thin black borders, no rounded corners by default
  return React.createElement('div', {
    className: 'd-box',
    style: {
      width: '100%',
      padding: padding ? getSpacing(padding) : undefined,
      margin: margin ? getSpacing(margin) : undefined,
      backgroundColor: background,
      border: border ? (typeof border === 'string' ? border : '1px solid #000') : undefined,
      borderRadius: 0,  // Square corners for print look (ignore borderRadius prop)
      boxSizing: 'border-box',
      ...style
    }
  }, children);
}

// =============================================================================
// TEXT COMPONENTS
// =============================================================================

function Text({ size = 'base', weight = 'normal', color = 'primary', align, as = 'span', children, style = {} }) {
  return React.createElement(as, {
    className: 'd-text',
    style: {
      fontSize: getFontSize(size),
      fontWeight: getFontWeight(weight),
      color: getTextColor(color),
      textAlign: align,
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      maxWidth: '100%',
      margin: as === 'p' ? 0 : undefined,
      ...style
    }
  }, children);
}

function Label({ size = 'xs', weight = 'medium', color = 'secondary', children, style = {} }) {
  return React.createElement('span', {
    className: 'd-label',
    style: {
      fontSize: getFontSize(size),
      fontWeight: getFontWeight(weight),
      color: getTextColor(color),
      display: 'block',
      ...style
    }
  }, children);
}

function Value({ size = 'base', emphasis = false, mono = false, children, style = {} }) {
  return React.createElement('span', {
    className: 'd-value',
    style: {
      fontSize: getFontSize(size),
      fontWeight: emphasis ? 600 : 400,
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: theme.colors.text.primary,
      display: 'block',
      ...style
    }
  }, children);
}

function Field({ label, inline = false, gap = 4, labelWidth, fieldId, children, style = {} }) {
  // Convert children to string for data attribute (for bounding box extraction)
  const childrenAsString = typeof children === 'string' ? children :
    (children?.props?.children ? String(children.props.children) : '');

  return React.createElement('div', {
    className: 'd-field',
    'data-field-id': fieldId || undefined,
    'data-field-label': typeof label === 'string' ? label : undefined,
    'data-field-value': fieldId ? childrenAsString : undefined,
    style: {
      display: inline ? 'flex' : 'block',
      flexDirection: inline ? 'row' : undefined,
      alignItems: inline ? 'baseline' : undefined,
      gap: inline ? gap : undefined,
      ...style
    }
  }, [
    label && React.createElement('div', {
      key: 'label',
      style: inline ? { width: labelWidth, flexShrink: 0 } : { marginBottom: 2 }
    }, typeof label === 'string' ? React.createElement(Label, null, label) : label),
    React.createElement('div', { key: 'value', style: { flex: inline ? 1 : undefined } }, children)
  ]);
}

function Body({ size = 'base', indent, lineHeight = 'normal', children, style = {} }) {
  return React.createElement('p', {
    className: 'd-body',
    style: {
      fontSize: getFontSize(size),
      lineHeight: theme.typography.lineHeights[lineHeight],
      color: theme.colors.text.primary,
      textIndent: indent,
      margin: 0,
      ...style
    }
  }, children);
}

function Note({ variant = 'default', border = false, children, style = {} }) {
  // Print-style note: simple text with optional thin border, no colored backgrounds
  const variantStyles = {
    default: { color: theme.colors.text.secondary },
    info: { color: theme.colors.text.primary, fontStyle: 'italic' },
    warning: { color: theme.colors.text.primary, fontWeight: 500 },
    muted: { color: theme.colors.text.muted },
  };
  return React.createElement('div', {
    className: 'd-note',
    style: {
      fontSize: getFontSize('sm'),
      lineHeight: 1.5,
      padding: border ? 8 : 4,
      borderRadius: 0,  // Square corners for print
      backgroundColor: 'transparent',  // No colored backgrounds
      border: border ? '1px solid #999' : undefined,
      ...variantStyles[variant],
      ...style
    }
  }, children);
}

function InlineField({ label, separator = ': ', children, style = {} }) {
  return React.createElement('span', {
    className: 'd-inline-field',
    style: { display: 'inline', ...style }
  }, [
    React.createElement(Label, { key: 'l', style: { display: 'inline' } }, label),
    separator,
    React.createElement(Value, { key: 'v', style: { display: 'inline' } }, children)
  ]);
}

// =============================================================================
// HEADER COMPONENTS
// =============================================================================

function Title({ size = 'xl', align = 'left', uppercase = true, letterSpacing = 2, children, style = {} }) {
  return React.createElement('h1', {
    className: 'd-title',
    style: {
      fontSize: getFontSize(size),
      fontWeight: 700,
      color: theme.colors.text.primary,
      textAlign: align,
      textTransform: uppercase ? 'uppercase' : undefined,
      letterSpacing,
      margin: 0,
      lineHeight: 1.2,
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      maxWidth: '100%',
      ...style
    }
  }, children);
}

function Subtitle({ size = 'md', align = 'left', children, style = {} }) {
  return React.createElement('h2', {
    className: 'd-subtitle',
    style: {
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      maxWidth: '100%',
      fontSize: getFontSize(size),
      fontWeight: 500,
      color: theme.colors.text.secondary,
      textAlign: align,
      margin: 0,
      lineHeight: 1.5,
      ...style
    }
  }, children);
}

function SectionTitle({ size = 'lg', underline = false, uppercase = false, children, style = {} }) {
  // Print-style section title: darker underline
  return React.createElement('h3', {
    className: 'd-section-title',
    style: {
      fontSize: getFontSize(size),
      fontWeight: 600,
      color: theme.colors.text.primary,
      textTransform: uppercase ? 'uppercase' : undefined,
      margin: 0,
      marginBottom: 8,
      paddingBottom: underline ? 4 : undefined,
      borderBottom: underline ? \`1px \${typeof underline === 'string' ? underline : 'solid'} #000\` : undefined,
      lineHeight: 1.5,
      ...style
    }
  }, children);
}

function Banner({ bg, color, padding = 'md', align = 'center', fullWidth = true, topBanner = false, children, style = {} }) {
  // Print-style banner: subtle background or bordered, not bright colored web header
  // Default to light gray background instead of blue/colored
  return React.createElement('div', {
    className: 'd-banner',
    style: {
      backgroundColor: bg || '#f5f5f5',  // Light gray, not blue-tinted
      color: color || theme.colors.text.primary,
      padding: getSpacing(padding),
      textAlign: align,
      fontWeight: 600,
      borderTop: '1px solid #ccc',
      borderBottom: '1px solid #ccc',
      ...(fullWidth && { marginLeft: -32, marginRight: -32, paddingLeft: 32, paddingRight: 32 }),
      ...(topBanner && { marginTop: -32, paddingTop: getSpacing(padding), borderTop: 'none' }),
      ...style
    }
  }, children);
}

function PageHeader({ border = false, padding = 'md', children, style = {} }) {
  // Print-style header: darker border when used
  return React.createElement('header', {
    className: 'd-page-header',
    style: {
      paddingBottom: getSpacing(padding),
      marginBottom: getSpacing(padding),
      borderBottom: border ? '1px solid #666' : undefined,
      ...style
    }
  }, children);
}

function Heading({ level = 2, size = 'lg', align, weight = 'semibold', children, style = {} }) {
  return React.createElement(\`h\${level}\`, {
    className: 'd-heading',
    style: {
      fontSize: getFontSize(size),
      fontWeight: getFontWeight(weight),
      color: theme.colors.text.primary,
      textAlign: align,
      margin: 0,
      lineHeight: 1.2,
      ...style
    }
  }, children);
}

// =============================================================================
// LETTERHEAD COMPONENTS
// =============================================================================

function Letterhead({ align = 'left', border = false, children, style = {} }) {
  // Print-style letterhead: darker border when used
  return React.createElement('div', {
    className: 'd-letterhead',
    style: {
      textAlign: align,
      paddingBottom: 16,
      marginBottom: 16,
      borderBottom: border ? '1px solid #666' : undefined,
      ...style
    }
  }, children);
}

function CompanyName({ size = 'xl', weight = 'bold', uppercase = false, letterSpacing = 1, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-company-name',
    style: {
      fontSize: getFontSize(size),
      fontWeight: getFontWeight(weight),
      color: theme.colors.text.primary,
      textTransform: uppercase ? 'uppercase' : undefined,
      letterSpacing,
      lineHeight: 1.2,
      margin: 0,
      ...style
    }
  }, children);
}

function Tagline({ size = 'sm', italic = false, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-tagline',
    style: {
      fontSize: getFontSize(size),
      fontStyle: italic ? 'italic' : undefined,
      color: theme.colors.text.secondary,
      marginTop: 4,
      lineHeight: 1.5,
      ...style
    }
  }, children);
}

function Logo({ companyName = 'Company', width = 80, height = 50, seed = 42, variant = 'combined', children, style = {} }) {
  // Print-style logo: simple bordered box with initials, like a corporate letterhead stamp
  // No colored backgrounds - just black/dark text with optional thin border
  const hash = (companyName + seed).split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
  const initials = companyName.split(/\\s+/).filter(w => w.length > 0 && !['&','and','the','of'].includes(w.toLowerCase())).slice(0,2).map(w => w[0]).join('').toUpperCase() || 'CO';

  // Different print-style logo variants
  const logoStyles = [
    // Simple bordered square
    { border: '2px solid #1a1a1a', bg: 'transparent', fg: '#1a1a1a', shape: 'square' },
    // Double-line border
    { border: '3px double #1a1a1a', bg: 'transparent', fg: '#1a1a1a', shape: 'square' },
    // Thin circle
    { border: '1px solid #1a1a1a', bg: 'transparent', fg: '#1a1a1a', shape: 'circle' },
    // Solid dark (like a stamp)
    { border: 'none', bg: '#1a1a1a', fg: '#ffffff', shape: 'square' },
    // Outlined circle
    { border: '2px solid #1a1a1a', bg: 'transparent', fg: '#1a1a1a', shape: 'circle' },
  ];
  const logoStyle = logoStyles[Math.abs(hash) % logoStyles.length];

  return React.createElement('div', {
    className: 'd-logo',
    style: { width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }
  }, React.createElement('div', {
    style: {
      width: Math.min(width, height) * 0.85,
      height: Math.min(width, height) * 0.85,
      backgroundColor: logoStyle.bg,
      border: logoStyle.border,
      borderRadius: logoStyle.shape === 'circle' ? '50%' : 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: Math.min(width, height) * 0.32,
      fontWeight: 700,
      color: logoStyle.fg,
      letterSpacing: '0.08em',
    }
  }, initials));
}

function CompanyInfo({ separator = ' | ', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-company-info',
    style: { fontSize: getFontSize('sm'), color: theme.colors.text.secondary, lineHeight: 1.4, ...style }
  }, children);
}

function ContactLine({ icon, label, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-contact-line',
    style: { fontSize: getFontSize('sm'), color: theme.colors.text.secondary, display: 'flex', alignItems: 'center', gap: 4, ...style }
  }, [
    icon && React.createElement('span', { key: 'i' }, icon),
    label && React.createElement('span', { key: 'l', style: { fontWeight: 500 } }, label + ':'),
    React.createElement('span', { key: 'v' }, children)
  ]);
}

// =============================================================================
// ADDRESS COMPONENTS
// =============================================================================

function Address({ label, border = false, children, style = {} }) {
  // Print-style address: thin black border when used, no rounded corners
  return React.createElement('address', {
    className: 'd-address',
    style: { lineHeight: 1.5, fontStyle: 'normal', ...style }
  }, [
    label && React.createElement('div', {
      key: 'label',
      style: { fontSize: getFontSize('xs'), fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }
    }, label),
    React.createElement('div', {
      key: 'content',
      style: border ? { padding: 8, border: '1px solid #000', borderRadius: 0 } : {}
    }, children)
  ]);
}

function AddressName({ bold = true, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-address-name',
    style: { fontWeight: bold ? 600 : 400, color: theme.colors.text.primary, fontStyle: 'normal', ...style }
  }, children);
}

function AddressLine({ children, style = {} }) {
  return React.createElement('div', {
    className: 'd-address-line',
    style: { color: theme.colors.text.primary, fontStyle: 'normal', ...style }
  }, children);
}

function AddressBlock({ label, name, company, street, street2, city, state, zip, country, border = false, children, style = {} }) {
  const cityLine = [city, state].filter(Boolean).join(', ') + (zip ? ' ' + zip : '');
  return React.createElement(Address, { label, border, style }, [
    name && React.createElement(AddressName, { key: 'n' }, name),
    company && React.createElement(AddressLine, { key: 'c' }, company),
    street && React.createElement(AddressLine, { key: 's1' }, street),
    street2 && React.createElement(AddressLine, { key: 's2' }, street2),
    cityLine && React.createElement(AddressLine, { key: 'cl' }, cityLine),
    country && React.createElement(AddressLine, { key: 'co' }, country),
    children
  ].filter(Boolean));
}

function AddressRow({ gap = 40, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-address-row',
    style: { display: 'flex', gap, ...style }
  }, children);
}

// =============================================================================
// TABLE COMPONENTS
// =============================================================================

// Table context for print-style tables
let tableContext = { striped: false, bordered: false };

function Table({ striped = false, bordered = false, compact = false, children, style = {} }) {
  tableContext = { striped, bordered };
  // Print-style table: thin black borders when bordered, minimal styling
  return React.createElement('table', {
    className: 'd-table',
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: compact ? getFontSize('xs') : getFontSize('sm'),
      tableLayout: 'fixed',
      // Print style: thin black outer border when bordered
      border: bordered ? '1px solid #000' : undefined,
      ...style
    }
  }, children);
}

function TableHeader({ bg, children, style = {} }) {
  // Print-style header: no background color, just a bottom border
  return React.createElement('thead', {
    className: 'd-table-header',
    style: { backgroundColor: bg || 'transparent', ...style }
  }, React.createElement('tr', {
    style: { borderBottom: '1px solid #000' }  // Thin black line, not thick gray
  }, children));
}

function HeaderCell({ align = 'left', width, colSpan, rowSpan, padding = 'sm', children, style = {} }) {
  const paddingValue = { sm: '4px 6px', md: '6px 10px', lg: '8px 14px' };
  return React.createElement('th', {
    className: 'd-header-cell',
    colSpan, rowSpan,
    style: {
      textAlign: align,
      width,
      padding: paddingValue[padding],
      fontWeight: 600,
      color: theme.colors.text.primary,
      whiteSpace: 'nowrap',
      // Print style: thin black vertical borders
      borderRight: tableContext.bordered ? '1px solid #000' : undefined,
      borderLeft: tableContext.bordered ? '1px solid #000' : undefined,
      ...style
    }
  }, children);
}

function TableBody({ children, style = {} }) {
  return React.createElement('tbody', { className: 'd-table-body', style }, children);
}

function TableRow({ index, children, style = {} }) {
  // Print-style: very subtle alternating (light gray, not blue-tinted)
  return React.createElement('tr', {
    className: 'd-table-row',
    style: {
      backgroundColor: tableContext.striped && index !== undefined && index % 2 === 1 ? '#f9f9f9' : undefined,
      borderBottom: tableContext.bordered ? '1px solid #000' : undefined,
      ...style
    }
  }, children);
}

function TableCell({ align = 'left', width, colSpan, rowSpan, padding = 'sm', children, style = {} }) {
  const paddingValue = { sm: '4px 6px', md: '6px 10px', lg: '8px 14px' };
  return React.createElement('td', {
    className: 'd-table-cell',
    colSpan, rowSpan,
    style: {
      textAlign: align,
      width,
      padding: paddingValue[padding],
      verticalAlign: 'top',
      // Print style: thin black vertical borders
      borderRight: tableContext.bordered ? '1px solid #000' : undefined,
      borderLeft: tableContext.bordered ? '1px solid #000' : undefined,
      wordBreak: 'break-word',
      ...style
    }
  }, children);
}

function TableFooter({ border = true, children, style = {} }) {
  return React.createElement('tfoot', {
    className: 'd-table-footer',
    style: { borderTop: border ? '1px solid #000' : undefined, ...style }
  }, children);
}

// =============================================================================
// FINANCIAL COMPONENTS
// =============================================================================

function Amount({ currency, size = 'base', mono = true, negative = false, children, style = {} }) {
  return React.createElement('span', {
    className: 'd-amount',
    style: {
      fontSize: getFontSize(size),
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: negative ? '#dc2626' : theme.colors.text.primary,
      whiteSpace: 'nowrap',
      ...style
    }
  }, [currency && React.createElement('span', { key: 'c' }, currency), children]);
}

function Total({ size = 'md', weight = 'bold', mono = true, children, style = {} }) {
  return React.createElement('span', {
    className: 'd-total',
    style: {
      fontSize: getFontSize(size),
      fontWeight: getFontWeight(weight),
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: theme.colors.text.primary,
      whiteSpace: 'nowrap',
      ...style
    }
  }, children);
}

function TotalRow({ label, amount, indent = 0, border = 'none', bold = false, children, style = {} }) {
  // Print-style total row: thin black borders when used
  return React.createElement('div', {
    className: 'd-total-row',
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingLeft: indent,
      paddingTop: 3,
      paddingBottom: 3,
      fontWeight: bold ? 600 : undefined,
      borderTop: border === 'top' || border === 'both' ? '1px solid #000' : undefined,
      borderBottom: border === 'bottom' || border === 'both' ? '1px solid #000' : undefined,
      ...style
    }
  }, children || [
    React.createElement('span', { key: 'l' }, label),
    React.createElement('span', { key: 'a', style: { fontFamily: 'ui-monospace, monospace' } }, amount)
  ]);
}

function TotalsSection({ width = 250, align = 'right', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-totals-section',
    style: {
      width,
      marginLeft: align === 'right' ? 'auto' : undefined,
      marginRight: align === 'left' ? 'auto' : undefined,
      marginTop: 16,
      ...style
    }
  }, children);
}

function GrandTotal({ label = 'Total', amount, size = 'lg', children, style = {} }) {
  // Print-style grand total: classic double-line border like financial documents
  return React.createElement('div', {
    className: 'd-grand-total',
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingTop: 6,
      paddingBottom: 6,
      borderTop: '1px solid #000',
      borderBottom: '3px double #000',  // Classic accounting double-line
      marginTop: 6,
      ...style
    }
  }, children || [
    React.createElement('span', { key: 'l', style: { fontSize: getFontSize(size), fontWeight: 700 } }, label),
    React.createElement('span', { key: 'a', style: { fontSize: getFontSize(size), fontWeight: 700, fontFamily: 'ui-monospace, monospace' } }, amount)
  ]);
}

function Currency({ value, currency = 'USD', locale = 'en-US', decimals = 2, size = 'base', mono = true, style = {} }) {
  const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return React.createElement('span', {
    className: 'd-currency',
    style: {
      fontSize: getFontSize(size),
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: value < 0 ? '#dc2626' : theme.colors.text.primary,
      whiteSpace: 'nowrap',
      ...style
    }
  }, formatted);
}

// =============================================================================
// SIGNATURE COMPONENTS
// =============================================================================

function SignatureArea({ width = 200, minWidth = 150, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-signature-area',
    style: { width, minWidth, ...style }
  }, children);
}

function SignatureLine({ lineStyle = 'solid', lineWidth = 1, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-signature-line',
    style: {
      position: 'relative',
      minHeight: 40,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      borderBottom: \`\${lineWidth}px \${lineStyle} \${theme.colors.border.heavy}\`,
      paddingBottom: 4,
      ...style
    }
  }, children);
}

function SignatureText({ font = 'Caveat', size = 28, rotation = 0, letterSpacing, color = '#1d4ed8', children, style = {} }) {
  return React.createElement('span', {
    className: 'd-signature-text',
    style: {
      fontFamily: \`"\${font}", cursive\`,
      fontSize: size,
      color: color, // Default blue ink
      transform: rotation ? \`rotate(\${rotation}deg)\` : undefined,
      letterSpacing,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, children);
}

function SignatureLabel({ required = false, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-signature-label',
    style: { fontSize: getFontSize('xs'), color: theme.colors.text.secondary, marginTop: 2, textAlign: 'center', ...style }
  }, [children, required && React.createElement('span', { key: 'r', style: { color: '#dc2626' } }, ' *')]);
}

function SignatureBlock({ label = 'Signature', signed, font = 'Caveat', signatureSize = 20, signatureRotation = 0, width = 150, required = false, children, style = {} }) {
  return React.createElement(SignatureArea, { width, style }, [
    React.createElement(SignatureLine, { key: 'line' },
      signed && React.createElement(SignatureText, { font, size: signatureSize, rotation: signatureRotation }, signed),
      children
    ),
    React.createElement(SignatureLabel, { key: 'label', required }, label)
  ]);
}

function SignatureRow({ gap = 40, justify = 'between', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-signature-row',
    style: { display: 'flex', justifyContent: getJustify(justify), gap, ...style }
  }, children);
}

function DateLine({ label = 'Date', value, font = 'Caveat', width = 150, children, style = {} }) {
  return React.createElement(SignatureArea, { width, style }, [
    React.createElement(SignatureLine, { key: 'line' },
      value && React.createElement(SignatureText, { font }, value),
      children
    ),
    React.createElement(SignatureLabel, { key: 'label' }, label)
  ]);
}

// =============================================================================
// FOOTER COMPONENTS
// =============================================================================

function Footer({ border = false, fixed = false, padding = 'md', children, style = {} }) {
  // Print-style footer: darker border when used
  return React.createElement('footer', {
    className: 'd-footer',
    style: {
      paddingTop: getSpacing(padding),
      marginTop: 24,
      borderTop: border ? '1px solid #666' : undefined,
      ...(fixed && { position: 'absolute', bottom: 48, left: 48, right: 48 }),
      ...style
    }
  }, children);
}

function FooterText({ align = 'center', muted = true, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-footer-text',
    style: {
      fontSize: getFontSize('xs'),
      color: muted ? theme.colors.text.muted : theme.colors.text.secondary,
      textAlign: align,
      lineHeight: 1.5,
      ...style
    }
  }, children);
}

function PageNumber({ current = 1, total, format = 'of', align = 'center', children, style = {} }) {
  let content = children;
  if (!content) {
    if (total) {
      content = format === 'simple' ? \`\${current}/\${total}\` : format === 'dash' ? \`\${current} - \${total}\` : \`Page \${current} of \${total}\`;
    } else {
      content = \`Page \${current}\`;
    }
  }
  return React.createElement('div', {
    className: 'd-page-number',
    style: { fontSize: getFontSize('xs'), color: theme.colors.text.muted, textAlign: align, ...style }
  }, content);
}

function FooterRow({ justify = 'between', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-footer-row',
    style: { display: 'flex', justifyContent: getJustify(justify), alignItems: 'center', gap: 16, ...style }
  }, children);
}

function LegalText({ numbered = false, children, style = {} }) {
  return React.createElement('div', {
    className: 'd-legal-text',
    style: { fontSize: getFontSize('xs'), color: theme.colors.text.muted, lineHeight: 1.5, ...style }
  }, children);
}

function Copyright({ year = new Date().getFullYear(), holder, align = 'center', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-copyright',
    style: { fontSize: getFontSize('xs'), color: theme.colors.text.muted, textAlign: align, ...style }
  }, children || \`© \${year}\${holder ? ' ' + holder : ''}. All rights reserved.\`);
}

function ThankYou({ message = 'Thank you for your business!', align = 'center', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-thank-you',
    style: { fontSize: getFontSize('xs'), fontStyle: 'italic', color: theme.colors.text.secondary, textAlign: align, marginTop: 12, ...style }
  }, children || message);
}

// =============================================================================
// DIVIDER COMPONENTS
// =============================================================================

function Divider({ thickness = 1, lineStyle = 'solid', color, margin = 'md', style = {} }) {
  // Print-style divider: default to dark gray/black, not light gray
  return React.createElement('hr', {
    className: 'd-divider',
    style: {
      border: 'none',
      borderTop: \`\${thickness}px \${lineStyle} \${color || '#666'}\`,
      margin: 0,
      marginTop: getSpacing(margin),
      marginBottom: getSpacing(margin),
      ...style
    }
  });
}

function Spacer({ size = 'md', style = {} }) {
  return React.createElement('div', {
    className: 'd-spacer',
    style: { height: getSpacing(size), flexShrink: 0, ...style }
  });
}

function VerticalDivider({ thickness = 1, height = '100%', lineStyle = 'solid', color, margin = 'sm', style = {} }) {
  return React.createElement('div', {
    className: 'd-vertical-divider',
    style: {
      width: thickness,
      height,
      backgroundColor: lineStyle === 'solid' ? (color || theme.colors.border.light) : undefined,
      borderLeft: lineStyle !== 'solid' ? \`\${thickness}px \${lineStyle} \${color || theme.colors.border.light}\` : undefined,
      marginLeft: getSpacing(margin),
      marginRight: getSpacing(margin),
      flexShrink: 0,
      alignSelf: 'stretch',
      ...style
    }
  });
}

function DoubleLine({ gap = 3, thickness = 1, color, margin = 'md', style = {} }) {
  // Print-style double line: black by default
  const lineColor = color || '#000';
  return React.createElement('div', {
    className: 'd-double-line',
    style: { marginTop: getSpacing(margin), marginBottom: getSpacing(margin), ...style }
  }, [
    React.createElement('hr', { key: '1', style: { border: 'none', borderTop: \`\${thickness}px solid \${lineColor}\`, margin: 0 } }),
    React.createElement('div', { key: 's', style: { height: gap } }),
    React.createElement('hr', { key: '2', style: { border: 'none', borderTop: \`\${thickness}px solid \${lineColor}\`, margin: 0 } })
  ]);
}

function DottedSpacer({ width = '100%', dotSize = 2, gap = 4, color, style = {} }) {
  return React.createElement('div', {
    className: 'd-dotted-spacer',
    style: {
      width,
      height: dotSize,
      backgroundImage: \`radial-gradient(circle, \${color || theme.colors.border.medium} \${dotSize/2}px, transparent \${dotSize/2}px)\`,
      backgroundSize: \`\${dotSize + gap}px \${dotSize}px\`,
      backgroundRepeat: 'repeat-x',
      ...style
    }
  });
}

function SectionBreak({ label, lineStyle = 'solid', margin = 'lg', style = {} }) {
  // Print-style section break: darker lines
  if (!label) return React.createElement(Divider, { margin, lineStyle, style });
  const lineStyleObj = { flex: 1, border: 'none', borderTop: \`1px \${lineStyle} #999\`, margin: 0 };
  return React.createElement('div', {
    className: 'd-section-break',
    style: { display: 'flex', alignItems: 'center', gap: 16, marginTop: getSpacing(margin), marginBottom: getSpacing(margin), ...style }
  }, [
    React.createElement('hr', { key: '1', style: lineStyleObj }),
    React.createElement('span', { key: 'l', style: { fontSize: getFontSize('xs'), color: '#666', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' } }, label),
    React.createElement('hr', { key: '2', style: lineStyleObj })
  ]);
}

// =============================================================================
// METADATA COMPONENTS
// =============================================================================

function DateDisplay({ value = new Date(), format = 'medium', locale = 'en-US', size = 'base', children, style = {} }) {
  const dateObj = typeof value === 'string' ? new Date(value) : value;
  const formatOptions = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  };
  const formatted = children || dateObj.toLocaleDateString(locale, formatOptions[format]);
  return React.createElement('span', {
    className: 'd-date',
    style: { fontSize: getFontSize(size), color: theme.colors.text.primary, ...style }
  }, formatted);
}

function RefNumber({ prefix, value, size = 'base', mono = true, children, style = {} }) {
  return React.createElement('span', {
    className: 'd-ref-number',
    style: {
      fontSize: getFontSize(size),
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: theme.colors.text.primary,
      ...style
    }
  }, children || (prefix ? prefix + value : value));
}

function DocumentId({ type = 'ref', value, size = 'base', children, style = {} }) {
  const labels = { invoice: 'Invoice #', quote: 'Quote #', po: 'PO #', order: 'Order #', receipt: 'Receipt #', ref: 'Ref #' };
  const label = labels[type] || type + ' #';
  return React.createElement('div', { className: 'd-document-id', style }, [
    React.createElement('div', { key: 'l', style: { fontSize: getFontSize('xs'), color: theme.colors.text.secondary, fontWeight: 500 } }, label),
    React.createElement('div', { key: 'v', style: { fontSize: getFontSize(size), fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: theme.colors.text.primary } }, children || value)
  ]);
}

function MetadataRow({ gap = 24, justify = 'end', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-metadata-row',
    style: { display: 'flex', gap, justifyContent: getJustify(justify), alignItems: 'flex-start', ...style }
  }, children);
}

function MetadataField({ label, align = 'left', children, style = {} }) {
  return React.createElement('div', {
    className: 'd-metadata-field',
    style: { textAlign: align, wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%', ...style }
  }, [
    React.createElement('div', { key: 'l', style: { fontSize: getFontSize('xs'), color: theme.colors.text.secondary, fontWeight: 500, marginBottom: 1 } }, label),
    React.createElement('div', { key: 'v', style: { fontSize: getFontSize('base'), color: theme.colors.text.primary, wordBreak: 'break-word' } }, children)
  ]);
}

function Timestamp({ value = new Date(), showTime = true, showDate = true, size = 'sm', children, style = {} }) {
  const dateObj = typeof value === 'string' ? new Date(value) : value;
  let formatted = '';
  if (showDate) formatted += dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (showDate && showTime) formatted += ' ';
  if (showTime) formatted += dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return React.createElement('span', {
    className: 'd-timestamp',
    style: { fontSize: getFontSize(size), color: theme.colors.text.muted, ...style }
  }, children || formatted);
}

function Status({ variant = 'default', size = 'sm', children, style = {} }) {
  // Print-style status: simple boxed text like a typewritten label, not a colored UI badge
  // Uses thin borders and minimal/no background for a document-appropriate look
  const variantStyles = {
    default: { border: '1px solid #666', color: '#333', bg: 'transparent' },
    success: { border: '1px solid #166534', color: '#166534', bg: 'transparent' },
    warning: { border: '1px solid #92400e', color: '#92400e', bg: 'transparent' },
    error: { border: '1px solid #991b1b', color: '#991b1b', bg: 'transparent' },
    info: { border: '1px solid #1e40af', color: '#1e40af', bg: 'transparent' },
  };
  const styles = variantStyles[variant] || variantStyles.default;
  return React.createElement('span', {
    className: 'd-status',
    style: {
      display: 'inline-block',
      fontSize: size === 'sm' ? 9 : 10,
      fontWeight: 600,
      fontFamily: 'ui-monospace, monospace',  // Typewriter-like
      padding: size === 'sm' ? '1px 6px' : '2px 8px',
      border: styles.border,
      borderRadius: 0,  // Square corners for print look
      backgroundColor: styles.bg,
      color: styles.color,
      textTransform: 'uppercase',
      letterSpacing: 1,
      ...style
    }
  }, children);
}

function Checkbox({ checked = false, label, size = 'sm', markStyle = 'x', style = {} }) {
  // Paper-style checkbox with handwritten X mark (default) - looks more realistic than checkmarks
  const boxSize = size === 'sm' ? 12 : size === 'md' ? 14 : 16;
  const markSize = boxSize + 8; // Mark larger than box for natural hand-drawn overflow

  // Handwritten mark options - X is default as it looks most natural
  const marks = {
    x: 'X',      // Simple X - looks most handwritten
    cross: '×',  // Multiplication sign
    check: '✓',  // Checkmark (looks more digital)
  };
  const mark = marks[markStyle] || marks.x;

  // Ink colors for handwritten marks (blue/black pen colors)
  const inkColors = ['#1e40af', '#1d4ed8', '#1f2937', '#374151'];
  const inkColor = inkColors[Math.floor(label?.length || 0) % inkColors.length];

  return React.createElement('div', {
    className: 'd-checkbox',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      ...style
    }
  }, [
    React.createElement('div', {
      key: 'box',
      style: {
        width: boxSize,
        height: boxSize,
        border: '1px solid ' + theme.colors.border.medium,
        borderRadius: 0, // Square corners like printed form
        backgroundColor: 'transparent', // Never filled - just an empty box
        flexShrink: 0,
        position: 'relative',
      }
    }, checked ? React.createElement('span', {
      style: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) rotate(-3deg)', // Slight tilt for handwritten feel
        fontFamily: '"Caveat", cursive',
        fontSize: markSize,
        fontWeight: 700,
        color: inkColor,
        lineHeight: 1,
        // Extend outside the box naturally
        width: markSize,
        height: markSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }
    }, mark) : null),
    label ? React.createElement('span', {
      key: 'label',
      style: { fontSize: size === 'sm' ? 10 : 12, color: theme.colors.text.primary }
    }, label) : null
  ]);
}

// =============================================================================
// STAMP COMPONENTS
// =============================================================================

function StampPaid({ rotation = -15 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #dc2626', borderRadius: 4, padding: '4px 12px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'lg', weight: 'bold', style: { color: '#dc2626', letterSpacing: 3, fontFamily: 'monospace' } }, 'PAID'));
}

function StampApproved({ rotation = -12 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #16a34a', borderRadius: 4, padding: '4px 12px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'lg', weight: 'bold', style: { color: '#16a34a', letterSpacing: 3, fontFamily: 'monospace' } }, 'APPROVED'));
}

function StampVoid({ rotation = -20 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '4px solid #dc2626', borderRadius: 4, padding: '6px 16px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'xl', weight: 'bold', style: { color: '#dc2626', letterSpacing: 6, fontFamily: 'monospace' } }, 'VOID'));
}

function StampDraft({ rotation = -10 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #6b7280', borderRadius: 4, padding: '4px 12px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'lg', weight: 'bold', style: { color: '#6b7280', letterSpacing: 3, fontFamily: 'monospace' } }, 'DRAFT'));
}

function StampConfidential({ rotation = -8 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #dc2626', borderRadius: 4, padding: '4px 10px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'md', weight: 'bold', style: { color: '#dc2626', letterSpacing: 2, fontFamily: 'monospace' } }, 'CONFIDENTIAL'));
}

function StampCopy({ rotation = -15 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #2563eb', borderRadius: 4, padding: '4px 12px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'lg', weight: 'bold', style: { color: '#2563eb', letterSpacing: 3, fontFamily: 'monospace' } }, 'COPY'));
}

function StampOriginal({ rotation = -12 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #16a34a', borderRadius: 4, padding: '4px 10px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'md', weight: 'bold', style: { color: '#16a34a', letterSpacing: 2, fontFamily: 'monospace' } }, 'ORIGINAL'));
}

function StampReceived({ date = 'JAN 15 2024', rotation = -10 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #2563eb', borderRadius: 4, padding: '6px 10px', transform: \`rotate(\${rotation}deg)\`, textAlign: 'center' }
  }, [
    React.createElement(Text, { key: 't', size: 'md', weight: 'bold', style: { color: '#2563eb', letterSpacing: 2, fontFamily: 'monospace' } }, 'RECEIVED'),
    React.createElement(Text, { key: 'd', size: 'xs', style: { color: '#2563eb', fontFamily: 'monospace', marginTop: 2 } }, date)
  ]);
}

function StampRejected({ rotation = -18 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-block', border: '3px solid #dc2626', borderRadius: 4, padding: '4px 10px', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'md', weight: 'bold', style: { color: '#dc2626', letterSpacing: 2, fontFamily: 'monospace' } }, 'REJECTED'));
}

function StampCircular({ text = 'OFFICIAL', rotation = 0 }) {
  return React.createElement(Box, {
    padding: 0,
    style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 70, height: 70, border: '3px solid #1e40af', borderRadius: '50%', transform: \`rotate(\${rotation}deg)\` }
  }, React.createElement(Text, { size: 'xs', weight: 'bold', style: { color: '#1e40af', letterSpacing: 1, fontFamily: 'monospace', textAlign: 'center' } }, text));
}

// =============================================================================
// BARCODE COMPONENTS
// =============================================================================

function Barcode({ value = '1234567890', width = 150, height = 40 }) {
  return React.createElement(Stack, { gap: 2, style: { width } }, [
    React.createElement(Box, {
      key: 'b',
      padding: 0,
      style: {
        height,
        background: 'repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 5px, #fff 5px, #fff 8px, #000 8px, #000 10px, #fff 10px, #fff 11px, #000 11px, #000 14px, #fff 14px, #fff 17px, #000 17px, #000 18px, #fff 18px, #fff 20px)'
      }
    }),
    React.createElement(Text, { key: 't', size: 'xs', style: { fontFamily: 'monospace', textAlign: 'center', letterSpacing: 2 } }, value)
  ]);
}

function BarcodeTall({ value = 'ABC-123456789', width = 180, height = 60 }) {
  return React.createElement(Stack, { gap: 2, style: { width } }, [
    React.createElement(Box, {
      key: 'b',
      padding: 0,
      style: {
        height,
        background: 'repeating-linear-gradient(90deg, #000 0px, #000 1px, #fff 1px, #fff 3px, #000 3px, #000 5px, #fff 5px, #fff 6px, #000 6px, #000 8px, #fff 8px, #fff 11px, #000 11px, #000 12px, #fff 12px, #fff 14px, #000 14px, #000 17px, #fff 17px, #fff 18px)'
      }
    }),
    React.createElement(Text, { key: 't', size: 'xs', style: { fontFamily: 'monospace', textAlign: 'center', letterSpacing: 1 } }, value)
  ]);
}

function QRCode({ size = 80 }) {
  return React.createElement(Box, {
    padding: 0,
    style: {
      width: size, height: size,
      backgroundColor: '#fff',
      border: '2px solid #000',
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gridTemplateRows: 'repeat(7, 1fr)',
      gap: 1,
      padding: 4,
    }
  }, [
    // Corner patterns (simplified)
    React.createElement('div', { key: 'tl', style: { gridColumn: '1/4', gridRow: '1/4', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('div', { style: { width: '50%', height: '50%', backgroundColor: '#000' } })),
    React.createElement('div', { key: 'tr', style: { gridColumn: '5/8', gridRow: '1/4', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('div', { style: { width: '50%', height: '50%', backgroundColor: '#000' } })),
    React.createElement('div', { key: 'bl', style: { gridColumn: '1/4', gridRow: '5/8', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('div', { style: { width: '50%', height: '50%', backgroundColor: '#000' } })),
  ]);
}

function QRCodeWithLabel({ label = 'Scan for details', size = 70 }) {
  return React.createElement(Stack, { gap: 'xs', style: { alignItems: 'center' } }, [
    React.createElement(QRCode, { key: 'qr', size }),
    React.createElement(Text, { key: 'l', size: 'xs', color: 'secondary' }, label)
  ]);
}

function ShippingBarcode({ trackingNumber = '1Z999AA10123456784' }) {
  return React.createElement(Box, { padding: 'sm', border: true },
    React.createElement(Stack, { gap: 'xs' }, [
      React.createElement(Text, { key: 't', size: 'xs', weight: 'semibold' }, 'TRACKING NUMBER'),
      React.createElement(Box, { key: 'b', padding: 0, style: { height: 50, background: 'repeating-linear-gradient(90deg, #000 0px, #000 3px, #fff 3px, #fff 5px, #000 5px, #000 6px, #fff 6px, #fff 9px, #000 9px, #000 11px, #fff 11px, #fff 13px, #000 13px, #000 16px, #fff 16px, #fff 18px, #000 18px, #000 19px, #fff 19px, #fff 22px)' } }),
      React.createElement(Text, { key: 'n', size: 'sm', weight: 'semibold', style: { fontFamily: 'monospace', textAlign: 'center', letterSpacing: 1 } }, trackingNumber)
    ])
  );
}
`;
}

/**
 * Generate CSS styles for components
 */
export function generateComponentStyles(): string {
  return `
/* Component styles only - base reset handled by route.ts */

/* Document container */
.d-document {
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
}

/* Prevent text overflow */
.d-text, .d-value, .d-label, .d-body {
  word-break: break-word;
  overflow-wrap: break-word;
}

/* Table layout */
.d-table {
  table-layout: fixed;
}

/* Address italic fix */
.d-address, .d-address * {
  font-style: normal;
}
`;
}
