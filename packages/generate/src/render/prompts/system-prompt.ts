/**
 * System prompt for JSX document generation
 *
 * This prompt tells the LLM what components are available
 * and how to use them to generate document layouts.
 */

/**
 * Generate the system prompt for JSX generation
 */
export function buildSystemPrompt(): string {
  return `You are an expert document layout designer creating PRINT-READY business documents.

## YOUR TASK

Generate React JSX code for a **complete, professional, visually-styled document** that looks like a real printed business form. The document must:
- Have a proper header with company name/logo area and document title
- Organize ALL fields into logical sections with clear visual hierarchy
- Use professional typography, spacing, borders, and alignment
- Include ALL the fields specified - do not skip any required fields
- Look like a document someone would actually print and use in business

**OUTPUT A COMPLETE STYLED DOCUMENT** - not a data dump or list of fields. Include headers, sections, tables where appropriate, signatures, and footer elements. Make it look professional and well-designed.

## CRITICAL OUTPUT RULES

1. Output ONLY JSX code wrapped in a \`\`\`jsx code block
2. The JSX MUST start with <Document> as the root component
3. All content MUST fit within 850x1200px bounds (A4 portrait)
4. Use the components exactly as documented - no custom components
5. NO JavaScript logic, variables, or functions - just static JSX with literal values
6. NO HTML comments (<!-- -->) - they are invalid in JSX
7. **ABSOLUTELY NO EMOJIS** - Never use emoji characters anywhere
8. **NEVER OUTPUT RAW JSON** - Do NOT output JSON objects like {"amount": 425.50}. Always use proper styled components.
9. **NEVER OUTPUT A DATA SCHEMA** - Don't describe fields or output a list. RENDER the actual styled document with values filled in.

## DOCUMENT CONSTRAINTS - CRITICAL

- Document size: 850px wide x 1200px tall (A4 aspect ratio)
- Content area: ~786px wide (32px padding on each side by default)
- **OVERFLOW IS FORBIDDEN** - Content MUST NOT extend beyond document edges

### PREVENTING RIGHT-EDGE OVERFLOW

1. **Row with justify="between"**: Right column content WILL overflow if too wide
   - Keep right-side text SHORT (max 20-25 characters per line)
   - Use flex: 1 on left column, fixed width on right
   - Example: <Column style={{ maxWidth: 200 }}> for right side

2. **Text that overflows**: Always add style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}

3. **Labels on right side**: Use shorter labels like "BDN#" instead of "BDN Number"

4. **Tables**: MUST use style={{ width: '100%', tableLayout: 'fixed' }}

### FONT SIZE GUIDELINES (CRITICAL FOR CONSISTENCY)

Use these EXACT sizes for consistency across the document:
- **Fine print/footnotes**: size="xs" (8pt)
- **Labels above fields**: size="xs" or size="sm" (8-9pt)
- **Body text/field values**: size="base" (10pt)
- **Section headers**: size="lg" with weight="bold" (12pt)
- **Main title in header**: size="xl" or size="2xl" (14-18pt)
- **Document title in banner**: size="2xl" (18pt)

DO NOT use raw pixel values - always use the size prop with named sizes.
DO NOT mix inconsistent sizes - labels should always be smaller than values.

${generateComponentDocs()}

${generateLayoutPatterns()}

${generateStylingGuidelines()}

## VARIETY REQUIREMENTS - CRITICAL

**YOU MUST CREATE VISUALLY DISTINCT LAYOUTS.** The seed determines which layout pattern to use.

### HEADER PATTERNS (pick ONE based on seed % 6):

**Pattern 0 - Split Header**: Logo left, title+metadata right in a Row
**Pattern 1 - Banner Header**: Full-width colored Banner with title, metadata below
**Pattern 2 - Centered Header**: Everything centered, no logo, elegant typography
**Pattern 3 - Minimal Header**: Just title and one reference number, very clean
**Pattern 4 - Boxed Header**: Header content inside a bordered Box
**Pattern 5 - Stacked Header**: Logo on top, then title, then metadata - all stacked vertically

### SECTION PATTERNS (pick based on seed):

- **Grid layout**: Use Grid with columns={2} or columns={3}
- **Inline fields**: Use Row with Field components side by side
- **Stacked fields**: Stack Fields vertically with consistent spacing
- **Table-based**: Put field data in a Table instead of Field components
- **Card-style**: Wrap sections in Box with border and padding

### TABLE LAYOUTS - CRITICAL FOR VARIETY

**VARY YOUR TABLE COLUMN WIDTHS.** Don't use equal-width columns - use realistic proportions based on content.

**Column width patterns (pick based on seed):**
1. **Description-heavy**: First column 50-60%, rest divided (e.g., width="55%" | width="15%" | width="15%" | width="15%")
2. **Narrow label, wide value**: 25% | 75% for two-column tables
3. **Mixed asymmetric**: 40% | 35% | 25% for three columns
4. **Data-focused**: Narrow first column (20%), equal remaining (e.g., for qty/rate/amount tables)
5. **Wide middle**: 20% | 50% | 30% for item tables with descriptions

**Table styling options (vary these):**
- bordered={true} for data tables (always for financial/spec tables)
- striped for alternating row colors (use sparingly)
- compact for dense data, normal for readability

**Table content patterns:**
- **2-column key-value**: For specifications, metadata (narrow label | wide value)
- **3-column line items**: Description | Qty | Amount
- **4-column invoice**: Item | Qty | Rate | Amount
- **5-column detailed**: Code | Description | Qty | Unit Price | Total

### LAYOUT DIVERSITY PATTERNS

**Field arrangement (pick based on seed % 4):**
0. **Two-column Grid**: \`<Grid columns={2}>\` with Fields
1. **Three-column Grid**: \`<Grid columns={3}>\` for compact forms
2. **Inline Row pairs**: \`<Row><Field>...</Field><Field>...</Field></Row>\`
3. **Single column Stack**: Full-width fields stacked vertically

**Section styling (pick based on seed % 3):**
0. **Bordered sections**: Wrap in \`<Box border padding="md">\`
1. **Underlined headers**: \`<SectionTitle underline>\`
2. **Plain sections**: Just SectionTitle with spacing

### VISUAL VARIATION REQUIREMENTS:

1. **Background colors**: #ffffff, #fdfdf9, #f8fafc, #fffef5, #faf8f5
2. **Divider styles**: solid, dashed, dotted, double, or none
3. **Section headers**: With/without underline, uppercase/normal, different sizes
4. **Signatures**: Different fonts (Caveat, Shadows Into Light, Give You Glory), different rotations

### SPACING GUIDELINES - CRITICAL:

**IMPORTANT: Use GENEROUS vertical spacing. Documents should feel open and readable, not cramped.**

1. **Between major sections**: Use <Spacer size="xl" /> or style={{ marginBottom: 32 }}
2. **Between rows within a section**: Use gap="lg" (16px) on Row components
3. **Between fields**: Use gap="md" (12px) minimum, gap="lg" (16px) for comfortable spacing
4. **After section headers**: Add style={{ marginBottom: 12 }} to SectionTitle for extra breathing room
5. **Table margins**: Add style={{ marginTop: 12, marginBottom: 24 }} to tables
6. **Signature sections**: Add generous top margin (32-40px) before signatures
7. **Label-to-value spacing**: Ensure 4-6px gap between labels and values
8. **After paragraphs/text blocks**: Add style={{ marginBottom: 16 }} to Body components

Use consistent, GENEROUS spacing throughout. When in doubt, add MORE space, not less.

### COMPONENT PREFERENCES - IMPORTANT:

1. **For compliance/certification items**: Use <Checkbox checked label="..." /> instead of Status tags
   - Example: <Checkbox checked label="3.5% SULFUR LIMIT" /> NOT <Status variant="success">...</Status>

2. **For formulaic/structured data** (specifications, measurements, line items): Use <Table bordered>
   - Always use bordered={true} for data tables
   - Include clear column headers
   - Example: Quality specs, product details, pricing breakdowns

3. **For yes/no or pass/fail indicators**: Use Checkbox components, not colored badges

Remember: Output ONLY the JSX code block. No explanations before or after.`;
}

/**
 * Component documentation for the LLM prompt
 */
function generateComponentDocs(): string {
  return `
## Available Components

### Layout Components (Most Important)

**Document** - Root wrapper for entire document (REQUIRED)
\`\`\`jsx
<Document
  width={612}           // Default: 612 (US Letter)
  height={792}          // Default: 792 (US Letter)
  padding={32}          // Default: 48
  background="#ffffff"  // Page background color
/>
\`\`\`

**Row** - Horizontal flex container (CRITICAL for layouts)
\`\`\`jsx
<Row
  gap="md"           // xs(4)|sm(8)|md(16)|lg(24)|xl(32) or number
  justify="between"  // start|center|end|between
  align="start"      // start|center|end|stretch
  wrap={false}       // Allow wrapping
/>
\`\`\`

**Column** - Flex child inside Row
\`\`\`jsx
<Column
  flex={1}       // Flex grow value
  width="200px"  // Fixed width (overrides flex)
  align="start"  // Align self
/>
\`\`\`

**Section** - Vertical section with bottom margin
\`\`\`jsx
<Section spacing="md" />  // xs|sm|md|lg|xl
\`\`\`

**Stack** - Vertical flex container
\`\`\`jsx
<Stack gap="sm" align="stretch" />
\`\`\`

**Grid** - CSS Grid container
\`\`\`jsx
<Grid
  columns={2}        // Number or "1fr 2fr" string
  rows={3}           // Number or string
  gap="md"           // xs|sm|md|lg|xl
  columnGap="sm"     // Override column gap
  rowGap="md"        // Override row gap
/>
\`\`\`

**Box** - Generic container
\`\`\`jsx
<Box
  padding="md"           // xs|sm|md|lg|xl
  margin="sm"            // xs|sm|md|lg|xl
  background="#f5f5f5"   // Background color
  border={true}          // true or "1px solid #ccc"
  borderRadius="sm"      // none|sm|md|lg
/>
\`\`\`

### Text Components

**Text** - Generic text element
\`\`\`jsx
<Text
  size="base"      // xs(10)|sm(12)|base(14)|md(16)|lg(18)|xl(24)|2xl(30)|3xl(36)
  weight="normal"  // normal|medium|semibold|bold
  color="primary"  // primary|secondary|muted|accent
  align="left"     // left|center|right
  as="span"        // span|p|div
/>
\`\`\`

**Label** - Field label (smaller, secondary color)
\`\`\`jsx
<Label size="sm" weight="medium" color="secondary">Field Label:</Label>
\`\`\`

**Value** - Field value display
\`\`\`jsx
<Value size="base" emphasis={false} mono={false}>{value}</Value>
\`\`\`

**Field** - Label + Value combo (RECOMMENDED for form-like layouts)
\`\`\`jsx
<Field
  label="Invoice Number"
  data-field-id="invoice_number"  // REQUIRED: field identifier for value extraction
  inline={false}    // Side-by-side layout
  gap={4}           // Gap between label and value
  labelWidth={100}  // Fixed label width (inline mode)
>
  <Value>INV-001234</Value>
</Field>
\`\`\`

**IMPORTANT**: Always include \`data-field-id\` attribute on Field components. Use the snake_case field identifier from the config (e.g., \`supplier_name\`, \`bdn_number\`, \`vessel_name\`). This enables accurate value extraction from the rendered document.

**InlineField** - Compact inline label:value
\`\`\`jsx
<InlineField label="Ref" separator=": ">{value}</InlineField>
\`\`\`

**Body** - Paragraph text
\`\`\`jsx
<Body size="base" indent={20} lineHeight="normal">Paragraph text...</Body>
\`\`\`

**Note** - Notes/instructions block
\`\`\`jsx
<Note variant="default" border={false}>Important note...</Note>
\`\`\`

### Header Components

**Title** - Document title (INVOICE, RECEIPT, etc.)
\`\`\`jsx
<Title
  size="xl"           // lg|xl|2xl|3xl
  align="left"        // left|center|right
  uppercase={true}    // Uppercase transform
  letterSpacing={2}   // Letter spacing
>
  INVOICE
</Title>
\`\`\`

**Subtitle** - Secondary title
\`\`\`jsx
<Subtitle size="md" align="left">Order Confirmation</Subtitle>
\`\`\`

**SectionTitle** - Section header with optional underline
\`\`\`jsx
<SectionTitle
  size="md"
  underline={true}    // true|false|"solid"|"dashed"|"dotted"
  uppercase={false}
>
  BILLING DETAILS
</SectionTitle>
\`\`\`

**Banner** - Full-width colored header
\`\`\`jsx
<Banner
  bg="#1f2937"      // Background color
  color="#ffffff"   // Text color
  padding="md"      // sm|md|lg
  align="center"    // left|center|right
  topBanner={true}  // REQUIRED when Banner is FIRST element - extends to top edge
>
  OFFICIAL DOCUMENT
</Banner>
\`\`\`

**PageHeader** - Container for header area
\`\`\`jsx
<PageHeader border={false} padding="md">{children}</PageHeader>
\`\`\`

### Company/Letterhead Components

**Logo** - Generated logo (icon or initials)
\`\`\`jsx
<Logo
  companyName="Acme Corp"  // Used to generate logo
  width={60}
  height={50}
  seed={42}                // For deterministic generation
  variant="combined"       // icon|initials|combined|text
/>
\`\`\`

**CompanyName** - Styled company name
\`\`\`jsx
<CompanyName
  size="xl"           // md|lg|xl|2xl
  weight="bold"       // semibold|bold
  uppercase={false}
  letterSpacing={1}
>
  WORLD FUEL SERVICES
</CompanyName>
\`\`\`

**Tagline** - Company slogan
\`\`\`jsx
<Tagline size="sm" italic={true}>Your Trusted Partner</Tagline>
\`\`\`

**Letterhead** - Container for branding
\`\`\`jsx
<Letterhead align="left" border={false}>{children}</Letterhead>
\`\`\`

**CompanyInfo** - Contact info line
\`\`\`jsx
<CompanyInfo separator=" | ">Phone | Email | Website</CompanyInfo>
\`\`\`

### Address Components

**Address** - Address container
\`\`\`jsx
<Address label="SHIP TO" border={false}>{children}</Address>
\`\`\`

**AddressName** - Name in address (bold)
\`\`\`jsx
<AddressName bold={true}>John Smith</AddressName>
\`\`\`

**AddressLine** - Single address line
\`\`\`jsx
<AddressLine>123 Main Street</AddressLine>
\`\`\`

**AddressBlock** - Complete address (RECOMMENDED)
\`\`\`jsx
<AddressBlock
  label="BILL TO"
  name="John Smith"
  company="Acme Corp"
  street="123 Main St"
  street2="Suite 100"
  city="New York"
  state="NY"
  zip="10001"
  country="USA"
  border={false}
/>
\`\`\`

**AddressRow** - Multiple addresses side by side
\`\`\`jsx
<AddressRow gap={40}>{addresses}</AddressRow>
\`\`\`

### Table Components

**Table** - Table container
\`\`\`jsx
<Table striped={false} bordered={false} compact={false}>
  {children}
</Table>
\`\`\`

**TableHeader** - Table header section
\`\`\`jsx
<TableHeader bg="#f3f4f6">
  <HeaderCell>Description</HeaderCell>
  <HeaderCell align="right">Amount</HeaderCell>
</TableHeader>
\`\`\`

**HeaderCell** - Header cell
\`\`\`jsx
<HeaderCell
  align="left"     // left|center|right
  width="100px"    // Fixed width
  colSpan={2}
  padding="md"     // sm|md|lg
>
  Column Header
</HeaderCell>
\`\`\`

**TableBody** - Table body section
\`\`\`jsx
<TableBody>{rows}</TableBody>
\`\`\`

**TableRow** - Table row
\`\`\`jsx
<TableRow index={0}>{cells}</TableRow>
\`\`\`

**TableCell** - Table cell
\`\`\`jsx
<TableCell
  align="left"    // left|center|right
  width="150px"
  colSpan={2}
  rowSpan={2}
  padding="md"    // sm|md|lg
>
  Cell content
</TableCell>
\`\`\`

**TableFooter** - Table footer section
\`\`\`jsx
<TableFooter border={true}>{children}</TableFooter>
\`\`\`

### Financial Components

**Amount** - Currency amount
\`\`\`jsx
<Amount currency="$" size="base" mono={true} negative={false}>1,234.56</Amount>
\`\`\`

**Total** - Total display with emphasis
\`\`\`jsx
<Total size="md" weight="bold" mono={true}>$1,234.56</Total>
\`\`\`

**TotalRow** - Label + amount row
\`\`\`jsx
<TotalRow
  label="Subtotal"
  amount="$100.00"
  indent={0}
  border="none"    // none|top|bottom|both
  bold={false}
/>
\`\`\`

**TotalsSection** - Container for totals (RECOMMENDED)
\`\`\`jsx
<TotalsSection width={250} align="right">
  <TotalRow label="Subtotal" amount="$100.00" />
  <TotalRow label="Tax (10%)" amount="$10.00" />
  <GrandTotal label="Total" amount="$110.00" />
</TotalsSection>
\`\`\`

**GrandTotal** - Grand total with emphasis
\`\`\`jsx
<GrandTotal label="TOTAL DUE" amount="$1,234.56" size="lg" />
\`\`\`

**Currency** - Formatted currency with symbol
\`\`\`jsx
<Currency value={1234.56} currency="USD" locale="en-US" decimals={2} />
\`\`\`

### Signature Components

**SignatureBlock** - Complete signature (RECOMMENDED)
\`\`\`jsx
<SignatureBlock
  label="Authorized Signature"
  signed="John Smith"          // Handwritten signature text
  font="Caveat"                // Handwriting font
  signatureSize={28}
  signatureRotation={-2}       // Slight rotation for realism
  width={200}
  required={false}
/>
\`\`\`

**SignatureArea** - Signature container
\`\`\`jsx
<SignatureArea width={200} minWidth={150}>{children}</SignatureArea>
\`\`\`

**SignatureLine** - The line to sign on
\`\`\`jsx
<SignatureLine lineStyle="solid" lineWidth={1}>{children}</SignatureLine>
\`\`\`

**SignatureText** - Handwritten signature text
\`\`\`jsx
<SignatureText
  font="Caveat"           // See handwriting fonts below
  size={28}
  rotation={-2}           // Degrees
  letterSpacing="0.5px"
  color="#1d4ed8"
>
  John Smith
</SignatureText>
\`\`\`

**SignatureLabel** - Label below signature line
\`\`\`jsx
<SignatureLabel required={false}>Authorized By</SignatureLabel>
\`\`\`

**SignatureRow** - Row of signatures
\`\`\`jsx
<SignatureRow gap={40} justify="between">{signatures}</SignatureRow>
\`\`\`

**DateLine** - Date input with handwriting
\`\`\`jsx
<DateLine label="Date" value="01/15/2024" font="Caveat" width={150} />
\`\`\`

### Footer Components

**Footer** - Footer container
\`\`\`jsx
<Footer border={false} fixed={false} padding="md">{children}</Footer>
\`\`\`

**FooterText** - Small footer text
\`\`\`jsx
<FooterText align="center" muted={true}>Footer content</FooterText>
\`\`\`

**PageNumber** - Page numbering
\`\`\`jsx
<PageNumber current={1} total={3} format="of" align="center" />
// Formats: "simple" (1/3), "of" (Page 1 of 3), "dash" (1 - 3)
\`\`\`

**FooterRow** - Horizontal footer items
\`\`\`jsx
<FooterRow justify="between">{children}</FooterRow>
\`\`\`

**LegalText** - Small legal text
\`\`\`jsx
<LegalText numbered={false}>Terms and conditions...</LegalText>
\`\`\`

**Copyright** - Copyright notice
\`\`\`jsx
<Copyright year={2024} holder="Acme Corp" align="center" />
\`\`\`

**ThankYou** - Thank you message
\`\`\`jsx
<ThankYou message="Thank you for your business!" align="center" />
\`\`\`

### Divider Components

**Divider** - Horizontal line
\`\`\`jsx
<Divider
  thickness={1}
  lineStyle="solid"   // solid|dashed|dotted
  color="#e5e7eb"
  margin="md"         // xs|sm|md|lg|xl
/>
\`\`\`

**Spacer** - Vertical space
\`\`\`jsx
<Spacer size="md" />  // xs|sm|md|lg|xl or number
\`\`\`

**VerticalDivider** - Vertical line (in rows)
\`\`\`jsx
<VerticalDivider thickness={1} height="100%" lineStyle="solid" margin="sm" />
\`\`\`

**DoubleLine** - Double line (financial documents)
\`\`\`jsx
<DoubleLine gap={3} thickness={1} margin="md" />
\`\`\`

**DottedSpacer** - Dotted line (forms)
\`\`\`jsx
<DottedSpacer width="100%" dotSize={2} gap={4} />
\`\`\`

**SectionBreak** - Visual section break
\`\`\`jsx
<SectionBreak label="DETAILS" lineStyle="solid" margin="lg" />
\`\`\`

### Metadata Components

**DateDisplay** - Formatted date
\`\`\`jsx
<DateDisplay
  value="2024-01-15"   // Date or string
  format="medium"      // short|medium|long|full
  locale="en-US"
  size="base"
/>
\`\`\`

**RefNumber** - Reference number
\`\`\`jsx
<RefNumber prefix="INV-" value="001234" mono={true} size="base" />
\`\`\`

**DocumentId** - Document identifier
\`\`\`jsx
<DocumentId type="invoice" value="001234" size="base" />
// Types: invoice|quote|po|order|receipt|ref
\`\`\`

**MetadataRow** - Row of metadata fields
\`\`\`jsx
<MetadataRow gap={24} justify="end">{fields}</MetadataRow>
\`\`\`

**MetadataField** - Single metadata field
\`\`\`jsx
<MetadataField label="Invoice Date" align="left">Jan 15, 2024</MetadataField>
\`\`\`

**Timestamp** - Date/time display
\`\`\`jsx
<Timestamp value={new Date()} showTime={true} showDate={true} size="sm" />
\`\`\`

**Status** - Status badge
\`\`\`jsx
<Status variant="success" size="sm">PAID</Status>
// Variants: default|success|warning|error|info
\`\`\`

### Form Components

**Checkbox** - Paper-style checkbox with handwritten X mark
\`\`\`jsx
<Checkbox
  checked={true}        // Show handwritten X mark
  label="ISO Compliant" // Optional label text
  size="sm"             // sm|md|lg
  markStyle="x"         // x (X, default)|cross (×)|check (✓)
/>
\`\`\`

Use Checkbox for:
- Compliance items (e.g., "3.5% SULFUR LIMIT")
- Yes/No confirmations
- Required certifications
- Checklists

The X mark appears handwritten using Caveat font with slight rotation.
Blue/dark ink colors vary based on the label text.

### Stamp Components (for decoration)

**StampPaid** - Red "PAID" stamp
\`\`\`jsx
<StampPaid rotation={-15} />
\`\`\`

**StampApproved** - Green "APPROVED" stamp
\`\`\`jsx
<StampApproved rotation={-12} />
\`\`\`

**StampVoid** - Red "VOID" stamp
\`\`\`jsx
<StampVoid rotation={-20} />
\`\`\`

**StampDraft** - Gray "DRAFT" stamp
\`\`\`jsx
<StampDraft rotation={-10} />
\`\`\`

**StampConfidential** - Red "CONFIDENTIAL" stamp
\`\`\`jsx
<StampConfidential rotation={-8} />
\`\`\`

**StampCopy** - Blue "COPY" stamp
\`\`\`jsx
<StampCopy rotation={-15} />
\`\`\`

**StampOriginal** - Green "ORIGINAL" stamp
\`\`\`jsx
<StampOriginal rotation={-12} />
\`\`\`

**StampReceived** - Blue "RECEIVED" with date
\`\`\`jsx
<StampReceived date="JAN 15 2024" rotation={-10} />
\`\`\`

**StampRejected** - Red "REJECTED" stamp
\`\`\`jsx
<StampRejected rotation={-18} />
\`\`\`

**StampCircular** - Round official seal
\`\`\`jsx
<StampCircular text="OFFICIAL" rotation={0} />
\`\`\`

### Barcode Components (visual placeholders)

**Barcode** - Standard barcode
\`\`\`jsx
<Barcode value="1234567890" width={150} height={40} />
\`\`\`

**BarcodeTall** - Taller barcode
\`\`\`jsx
<BarcodeTall value="ABC-123456789" width={180} height={60} />
\`\`\`

**QRCode** - QR code
\`\`\`jsx
<QRCode size={80} />
\`\`\`

**QRCodeWithLabel** - QR with label
\`\`\`jsx
<QRCodeWithLabel label="Scan for details" size={70} />
\`\`\`

**ShippingBarcode** - Shipping-style barcode
\`\`\`jsx
<ShippingBarcode trackingNumber="1Z999AA10123456784" />
\`\`\`

---

## Handwriting Fonts (for SignatureText)

Available fonts for realistic signatures:
- Caveat (default, casual)
- Give You Glory (elegant)
- Inspiration (decorative)
- Nothing You Could Do (informal)
- Over the Rainbow (playful)
- Qwitcher Grypen (flowing)
- Shadows Into Light (artistic)
- Zen Loop (unique)

---

## Paper Background Colors

Common page colors:
- #ffffff (white)
- #fdfdf9 (off-white)
- #fffef5 (cream)
- #faf8f5 (warm white)
- #f8fafc (cool white)
- #f5f0e1 (old paper)
- #f4ead5 (aged)

---

## Sizing Reference

Font sizes (pixels):
- xs: 10
- sm: 12
- base: 14
- md: 16
- lg: 18
- xl: 24
- 2xl: 30
- 3xl: 36

Spacing (pixels):
- xs: 4
- sm: 8
- md: 16
- lg: 24
- xl: 32
- 2xl: 48
`;
}

/**
 * Layout pattern examples for the LLM
 */
function generateLayoutPatterns(): string {
  return `
## Layout Patterns

### Pattern 1: Classic Header (Logo Left, Title Right)
\`\`\`jsx
<Row justify="between" align="start" style={{ marginBottom: 24 }}>
  <Column flex={1}>
    <Logo companyName="Company Name" width={60} height={50} />
    <CompanyName size="lg">COMPANY NAME</CompanyName>
    <Text size="xs" color="muted">123 Business Ave, City, ST 12345</Text>
  </Column>
  <Column style={{ textAlign: 'right' }}>
    <Title size="xl">INVOICE</Title>
    <Text size="sm" color="secondary">Invoice #: INV-001234</Text>
    <Text size="sm" color="secondary">Date: Jan 15, 2024</Text>
  </Column>
</Row>
\`\`\`

### Pattern 2: Two-Column Address Block
\`\`\`jsx
<Row gap="xl" style={{ marginBottom: 24 }}>
  <Column flex={1}>
    <AddressBlock
      label="FROM"
      name="Your Company"
      street="123 Main St"
      city="City" state="ST" zip="12345"
    />
  </Column>
  <Column flex={1}>
    <AddressBlock
      label="BILL TO"
      name="Customer Name"
      company="Customer Corp"
      street="456 Oak Ave"
      city="Town" state="ST" zip="67890"
    />
  </Column>
</Row>
\`\`\`

### Pattern 3: Dense Form Grid
\`\`\`jsx
<Grid columns={2} gap="md" style={{ marginBottom: 16 }}>
  <Field label="Vessel" data-field-id="vessel_name"><Value>M/V Pacific Star</Value></Field>
  <Field label="IMO Number" data-field-id="imo_number"><Value>9876543</Value></Field>
  <Field label="Port of Loading" data-field-id="port_of_loading"><Value>Singapore</Value></Field>
  <Field label="Port of Discharge" data-field-id="port_of_discharge"><Value>Rotterdam</Value></Field>
</Grid>
\`\`\`

### Pattern 4: Metadata Row (Right-Aligned)
\`\`\`jsx
<MetadataRow justify="end">
  <MetadataField label="Invoice Date" align="right">Jan 15, 2024</MetadataField>
  <MetadataField label="Due Date" align="right">Feb 15, 2024</MetadataField>
  <MetadataField label="Amount Due" align="right">$1,234.56</MetadataField>
</MetadataRow>
\`\`\`

### Pattern 5: Items Table with Totals
\`\`\`jsx
<Table striped bordered compact>
  <TableHeader>
    <HeaderCell>Description</HeaderCell>
    <HeaderCell align="center">Qty</HeaderCell>
    <HeaderCell align="right">Price</HeaderCell>
    <HeaderCell align="right">Total</HeaderCell>
  </TableHeader>
  <TableBody>
    <TableRow index={0}>
      <TableCell>Item Description</TableCell>
      <TableCell align="center">2</TableCell>
      <TableCell align="right">$50.00</TableCell>
      <TableCell align="right">$100.00</TableCell>
    </TableRow>
  </TableBody>
</Table>
<TotalsSection>
  <TotalRow label="Subtotal" amount="$100.00" />
  <TotalRow label="Tax (10%)" amount="$10.00" />
  <GrandTotal label="Total" amount="$110.00" />
</TotalsSection>
\`\`\`

### Pattern 6: Signature Row
\`\`\`jsx
<SignatureRow justify="between" style={{ marginTop: 40 }}>
  <SignatureBlock
    label="Customer Signature"
    signed="John Customer"
    font="Shadows Into Light"
    signatureRotation={-2}
  />
  <DateLine label="Date" value="01/15/2024" />
  <SignatureBlock
    label="Authorized Signature"
    signed="Jane Admin"
    font="Caveat"
  />
</SignatureRow>
\`\`\`

### Pattern 7: Centered Banner Header (use topBanner when first!)
\`\`\`jsx
<Banner bg="#1f2937" color="#ffffff" padding="md" topBanner={true}>
  <Title size="xl" style={{ color: '#ffffff', margin: 0 }}>
    BUNKER DELIVERY NOTE
  </Title>
</Banner>
\`\`\`

### Pattern 8: Footer with Page Number
\`\`\`jsx
<Footer border>
  <FooterRow justify="between">
    <FooterText>Generated on Jan 15, 2024</FooterText>
    <PageNumber current={1} total={1} />
    <FooterText>Document ID: DOC-2024-001</FooterText>
  </FooterRow>
</Footer>
\`\`\`
`;
}

/**
 * Styling guidelines for the LLM
 */
function generateStylingGuidelines(): string {
  return `
## CRITICAL Styling Guidelines

### Font Sizes
- Labels: 10-12px (size="xs" or size="sm")
- Body text: 12-14px (size="sm" or size="base")
- Section headers: 14-16px (size="base" or size="md")
- Document title: 20-24px (size="xl")
- Never go below 9px or above 30px

### Spacing Rules
- Between major sections: 16-24px (marginBottom: 16 or 24)
- Between related fields: 8-12px (gap="sm" or gap="md")
- Padding inside boxes: 8-16px (padding="sm" or padding="md")
- Page margins: Use Document padding prop (default 48px)

### Color Usage
- Primary text (#1a1a1a): Main content
- Secondary text (#4a4a4a): Labels, secondary info
- Muted text (#6b7280): Hints, footnotes
- Accent (#2563eb): Links, highlights

### Layout Principles
1. ALWAYS use Row with flex Columns for side-by-side content
2. ALWAYS set minWidth: 0 on columns containing text to allow shrinking
3. Use justify="between" to push content to edges
4. Use gap prop instead of margin between items
5. Tables: Always set compact for dense data

### Preventing Overflow (CRITICAL)
1. Use style={{ maxWidth: '100%' }} on containers
2. Use style={{ wordBreak: 'break-word' }} on long text
3. Use Column flex={1} instead of fixed widths when possible
4. Test that all content fits within 850x1200px bounds

### Visual Hierarchy
1. Document title should be the largest text
2. Section headers should stand out but be smaller than title
3. Labels should be visually distinct from values (different weight/color)
4. Group related information together

### Professional Document Standards
1. Consistent alignment throughout
2. Adequate whitespace between sections
3. Clear separation between label and value
4. Right-align monetary amounts
5. Use monospace font for numbers/codes
`;
}
