/**
 * @doclo/generate - Toolkit for generating synthetic document data
 *
 * This package provides utilities for creating realistic test data
 * for document extraction and processing workflows.
 */

// ============================================================================
// Document Generation Config Schema
// ============================================================================

export * from './document-config';

// ============================================================================
// Pre-built Document Configs
// ============================================================================

export * from './configs';

// ============================================================================
// Types
// ============================================================================

export interface GeneratorOptions {
  /** Seed for reproducible random generation */
  seed?: number;
  /** Locale for region-specific data (e.g., 'en-US', 'en-GB') */
  locale?: string;
}

export interface DocumentData {
  /** Document type identifier */
  type: string;
  /** Generated field values */
  fields: Record<string, unknown>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Random utilities
// ============================================================================

/**
 * Simple seeded random number generator (Mulberry32)
 */
function createRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

/**
 * Generate a random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/**
 * Generate a random decimal with specified precision
 */
function randomDecimal(min: number, max: number, decimals: number, random: () => number): number {
  const value = random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

// ============================================================================
// Data pools
// ============================================================================

const COMPANY_NAMES = [
  'Acme Corporation', 'Global Industries', 'Pacific Trading Co.',
  'Northern Logistics', 'Atlantic Shipping', 'Sunrise Manufacturing',
  'Premier Services', 'United Suppliers', 'Delta Distribution',
  'Coastal Exports', 'Mountain View Tech', 'River Valley Farms'
];

// BDN-specific data pools
const BDN_SUPPLIER_NAMES = [
  'GCC Supply & Trading', 'Peninsula Petroleum', 'World Fuel Services',
  'Monjasa', 'Bunker Holding', 'OW Bunker', 'Aegean Marine',
  'Cockett Marine', 'Minerva Bunkering', 'Bomin', 'Glander International',
  'KPI OceanConnect', 'Baltoil', 'Dan-Bunkering', 'Fratelli Cosulich'
];

const VESSEL_NAMES = [
  'Palena', 'Ever Given', 'Nordic Ace', 'Maersk Alabama', 'Pacific Pioneer',
  'Atlantic Star', 'Sea Crown', 'Pearl Marine', 'Ocean Voyager', 'Blue Horizon',
  'Northern Spirit', 'Global Carrier', 'Maritime Pride', 'Coastal Guardian',
  'Trade Wind', 'Silver Wave', 'Golden Dragon', 'Eastern Promise'
];

const PORTS = [
  'Houston', 'Singapore', 'Rotterdam', 'Fujairah', 'Hong Kong', 'Los Angeles',
  'Long Beach', 'New Orleans', 'Galveston', 'Port Arthur', 'Corpus Christi',
  'Panama', 'Gibraltar', 'Piraeus', 'Antwerp', 'Hamburg', 'Santos'
];

const TERMINALS = [
  'Barbours Cut Terminal #1', 'Bayport Terminal', 'Manchester Terminal',
  'Greens Port Terminal', 'Pasadena Terminal', 'Texas City Terminal',
  'Galveston Anchorage', 'Ship Channel Terminal', 'Deer Park Terminal'
];

const FLAGS = [
  'Liberia', 'Panama', 'Marshall Islands', 'Bahamas', 'Malta', 'Cyprus',
  'Singapore', 'Hong Kong', 'Greece', 'Norway', 'Japan', 'China'
];

const FUEL_GRADES = [
  { code: 'VLSFO', name: 'Very Low Sulfur Fuel Oil' },
  { code: 'HSFO', name: 'High Sulfur Fuel Oil' },
  { code: 'MGO', name: 'Marine Gas Oil' },
  { code: 'DMA', name: 'Distillate Marine A' },
  { code: 'DMB', name: 'Distillate Marine B' },
  { code: 'ULSFO', name: 'Ultra Low Sulfur Fuel Oil' },
  { code: 'LSMGO', name: 'Low Sulfur Marine Gas Oil' },
  { code: 'IFO 180', name: 'Intermediate Fuel Oil 180' },
  { code: 'IFO 380', name: 'Intermediate Fuel Oil 380' }
];

const BARGE_NAMES = [
  'Kirby 28750', 'Moran 401', 'Reinauer 220', 'K-Sea 105', 'Penn Maritime 32',
  'OSG 117', 'Bouchard 245', 'Crowley 308', 'Seabulk Atlantic', 'Genesis 42'
];

const FIRST_NAMES = [
  'James', 'Maria', 'John', 'Sarah', 'Michael', 'Jennifer',
  'David', 'Lisa', 'Robert', 'Emily', 'William', 'Emma'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia',
  'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor'
];

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin'
];

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'Singapore', 'Netherlands'
];

const PRODUCT_ADJECTIVES = [
  'Premium', 'Standard', 'Industrial', 'Commercial', 'Professional',
  'Basic', 'Advanced', 'Custom', 'Specialty', 'Heavy-Duty'
];

const PRODUCT_NOUNS = [
  'Widget', 'Component', 'Assembly', 'Module', 'Unit',
  'Device', 'System', 'Kit', 'Pack', 'Set'
];

// ============================================================================
// Generator class
// ============================================================================

export class SyntheticGenerator {
  private random: () => number;
  private locale: string;

  constructor(options: GeneratorOptions = {}) {
    this.random = createRandom(options.seed ?? Date.now());
    this.locale = options.locale ?? 'en-US';
  }

  // --------------------------------------------------------------------------
  // Basic generators
  // --------------------------------------------------------------------------

  /** Generate a company name */
  companyName(): string {
    return pickRandom(COMPANY_NAMES, this.random);
  }

  /** Generate a person's full name */
  personName(): string {
    const first = pickRandom(FIRST_NAMES, this.random);
    const last = pickRandom(LAST_NAMES, this.random);
    return `${first} ${last}`;
  }

  /** Generate a city name */
  city(): string {
    return pickRandom(CITIES, this.random);
  }

  /** Generate a country name */
  country(): string {
    return pickRandom(COUNTRIES, this.random);
  }

  /** Generate a product name */
  productName(): string {
    const adj = pickRandom(PRODUCT_ADJECTIVES, this.random);
    const noun = pickRandom(PRODUCT_NOUNS, this.random);
    return `${adj} ${noun}`;
  }

  /** Generate a random date within a range */
  date(startYear = 2020, endYear = 2025): string {
    const year = randomInt(startYear, endYear, this.random);
    const month = randomInt(1, 12, this.random);
    const day = randomInt(1, 28, this.random);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /** Generate a reference/invoice number */
  referenceNumber(prefix = 'INV'): string {
    const num = randomInt(10000, 99999, this.random);
    return `${prefix}-${num}`;
  }

  /** Generate a monetary amount */
  amount(min = 100, max = 10000): number {
    return randomDecimal(min, max, 2, this.random);
  }

  /** Generate a quantity */
  quantity(min = 1, max = 100): number {
    return randomInt(min, max, this.random);
  }

  /** Generate a unit price */
  unitPrice(min = 10, max = 500): number {
    return randomDecimal(min, max, 2, this.random);
  }

  /** Generate an email address */
  email(name?: string): string {
    const baseName = name ?? this.personName();
    const normalized = baseName.toLowerCase().replace(/\s+/g, '.');
    const domains = ['example.com', 'test.org', 'sample.net', 'demo.io'];
    return `${normalized}@${pickRandom(domains, this.random)}`;
  }

  /** Generate a phone number */
  phone(): string {
    const area = randomInt(200, 999, this.random);
    const prefix = randomInt(200, 999, this.random);
    const line = randomInt(1000, 9999, this.random);
    return `+1 (${area}) ${prefix}-${line}`;
  }

  /** Generate a street address */
  address(): string {
    const number = randomInt(100, 9999, this.random);
    const streets = ['Main St', 'Oak Ave', 'Park Blvd', 'Market St', 'First Ave'];
    const street = pickRandom(streets, this.random);
    return `${number} ${street}`;
  }

  // --------------------------------------------------------------------------
  // Document generators
  // --------------------------------------------------------------------------

  /** Generate a synthetic invoice */
  invoice(): DocumentData {
    const lineItemCount = randomInt(1, 5, this.random);
    const lineItems = Array.from({ length: lineItemCount }, () => {
      const qty = this.quantity();
      const price = this.unitPrice();
      return {
        description: this.productName(),
        quantity: qty,
        unitPrice: price,
        total: Number((qty * price).toFixed(2))
      };
    });

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const taxRate = pickRandom([0.05, 0.07, 0.08, 0.1], this.random);
    const tax = Number((subtotal * taxRate).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));

    return {
      type: 'invoice',
      fields: {
        invoiceNumber: this.referenceNumber('INV'),
        invoiceDate: this.date(),
        dueDate: this.date(),
        vendor: {
          name: this.companyName(),
          address: this.address(),
          city: this.city(),
          country: this.country()
        },
        customer: {
          name: this.companyName(),
          address: this.address(),
          city: this.city(),
          country: this.country()
        },
        lineItems,
        subtotal,
        taxRate: Number((taxRate * 100).toFixed(1)),
        tax,
        total,
        currency: 'USD'
      }
    };
  }

  /** Generate a synthetic receipt */
  receipt(): DocumentData {
    const itemCount = randomInt(1, 8, this.random);
    const items = Array.from({ length: itemCount }, () => ({
      name: this.productName(),
      price: this.unitPrice(5, 100)
    }));

    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    const tax = Number((subtotal * 0.08).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));

    return {
      type: 'receipt',
      fields: {
        storeName: this.companyName(),
        storeAddress: this.address(),
        storeCity: this.city(),
        date: this.date(),
        time: `${randomInt(8, 20, this.random)}:${String(randomInt(0, 59, this.random)).padStart(2, '0')}`,
        items,
        subtotal: Number(subtotal.toFixed(2)),
        tax,
        total,
        paymentMethod: pickRandom(['Cash', 'Credit Card', 'Debit Card'], this.random)
      }
    };
  }

  /** Generate a synthetic purchase order */
  purchaseOrder(): DocumentData {
    const lineItemCount = randomInt(2, 6, this.random);
    const lineItems = Array.from({ length: lineItemCount }, () => {
      const qty = this.quantity(10, 500);
      const price = this.unitPrice();
      return {
        itemCode: `SKU-${randomInt(1000, 9999, this.random)}`,
        description: this.productName(),
        quantity: qty,
        unitPrice: price,
        total: Number((qty * price).toFixed(2))
      };
    });

    const total = lineItems.reduce((sum, item) => sum + item.total, 0);

    return {
      type: 'purchase_order',
      fields: {
        poNumber: this.referenceNumber('PO'),
        orderDate: this.date(),
        requiredDate: this.date(),
        buyer: {
          name: this.companyName(),
          contact: this.personName(),
          email: this.email(),
          phone: this.phone()
        },
        supplier: {
          name: this.companyName(),
          contact: this.personName(),
          email: this.email(),
          phone: this.phone()
        },
        lineItems,
        total: Number(total.toFixed(2)),
        currency: 'USD',
        paymentTerms: pickRandom(['Net 30', 'Net 60', 'Due on Receipt'], this.random),
        shippingMethod: pickRandom(['Ground', 'Express', 'Air Freight'], this.random)
      }
    };
  }

  /** Generate a synthetic bill of lading */
  billOfLading(): DocumentData {
    const containerCount = randomInt(1, 4, this.random);
    const containers = Array.from({ length: containerCount }, () => ({
      containerNumber: `${pickRandom(['MSKU', 'TCLU', 'TRLU'], this.random)}${randomInt(1000000, 9999999, this.random)}`,
      sealNumber: `SL${randomInt(100000, 999999, this.random)}`,
      weight: randomDecimal(5000, 25000, 0, this.random),
      description: this.productName()
    }));

    return {
      type: 'bill_of_lading',
      fields: {
        blNumber: this.referenceNumber('BL'),
        shipper: {
          name: this.companyName(),
          address: this.address(),
          city: this.city(),
          country: this.country()
        },
        consignee: {
          name: this.companyName(),
          address: this.address(),
          city: this.city(),
          country: this.country()
        },
        notifyParty: {
          name: this.companyName(),
          address: this.address(),
          city: this.city(),
          country: this.country()
        },
        vesselName: `MV ${pickRandom(['Pacific', 'Atlantic', 'Northern', 'Southern'], this.random)} ${pickRandom(['Star', 'Queen', 'Express', 'Pioneer'], this.random)}`,
        voyageNumber: `V${randomInt(100, 999, this.random)}`,
        portOfLoading: this.city(),
        portOfDischarge: this.city(),
        dateOfShipment: this.date(),
        containers,
        freightTerms: pickRandom(['Prepaid', 'Collect'], this.random)
      }
    };
  }

  /** Generate a synthetic bunker delivery note */
  bunkerDeliveryNote(): DocumentData {
    // Generate reference numbers
    const refNumber1 = `PHY ${randomInt(100000, 999999, this.random)}`;
    const refNumber2 = `${randomInt(100000, 999999, this.random)}`;
    const imoNumber = `${randomInt(9000000, 9999999, this.random)}`;
    const bargeRef = pickRandom(BARGE_NAMES, this.random);

    // Fuel specifications
    const fuelGrade = pickRandom(FUEL_GRADES, this.random);
    const isDistillate = ['DMA', 'DMB', 'MGO', 'LSMGO'].includes(fuelGrade.code);

    // Physical properties depend on fuel type
    const viscosity = isDistillate
      ? randomDecimal(2, 6, 2, this.random)
      : randomDecimal(50, 380, 2, this.random);
    const density = isDistillate
      ? randomDecimal(820, 870, 1, this.random)
      : randomDecimal(920, 991, 1, this.random);
    const sulfurContent = fuelGrade.code.includes('VLSFO') || fuelGrade.code.includes('ULSFO') || fuelGrade.code.includes('LSMGO')
      ? randomDecimal(0.05, 0.5, 2, this.random)
      : randomDecimal(0.5, 3.5, 2, this.random);

    const netBarrels = randomDecimal(5000, 25000, 2, this.random);
    const metricTons = randomDecimal(netBarrels * 0.14, netBarrels * 0.16, 2, this.random);
    const temperature = randomDecimal(70, 150, 1, this.random);
    const flashPoint = isDistillate
      ? randomDecimal(60, 75, 0, this.random)
      : randomDecimal(200, 280, 0, this.random);

    // Timing
    const deliveryDate = this.date(2023, 2024);
    const commencedHour = randomInt(0, 20, this.random);
    const commencedMin = randomInt(0, 59, this.random);
    const durationHours = randomInt(2, 8, this.random);
    const finishedHour = (commencedHour + durationHours) % 24;
    const finishedMin = randomInt(0, 59, this.random);

    const formatTime = (h: number, m: number) =>
      `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;

    // Sample seal numbers (7-digit numbers)
    const baseSealNum = randomInt(1330000, 1340000, this.random);
    const sealNumbers = {
      vessel: String(baseSealNum),
      supplier: String(baseSealNum + 1),
      vesselMarpol: String(baseSealNum - 1),
      supplierMarpol: String(baseSealNum + 2)
    };

    // MARPOL compliance
    const marpolCompliance = {
      threeFivePercent: this.random() > 0.3,
      pointFivePercent: this.random() > 0.5,
      pointOnePercent: this.random() > 0.8,
      purchaserSpecified: false,
      purchaserLimit: null as number | null
    };

    return {
      type: 'bunker_delivery_note',
      fields: {
        supplier: {
          name: pickRandom(BDN_SUPPLIER_NAMES, this.random),
          address: `${randomInt(1000, 9999, this.random)} ${pickRandom(['Richmond Ave', 'Main St', 'Harbor Blvd', 'Maritime Way'], this.random)}, Suite ${randomInt(100, 500, this.random)}`,
          city: pickRandom(['Houston', 'Singapore', 'Rotterdam', 'Fujairah'], this.random),
          state: pickRandom(['TX', 'CA', 'NY', 'FL', null], this.random),
          zip: `${randomInt(10000, 99999, this.random)}`,
          phone: this.phone(),
          website: `www.${pickRandom(['bunker', 'marine', 'fuel', 'oil'], this.random)}supply.com`
        },
        referenceNumbers: {
          primary: refNumber1,
          secondary: refNumber2
        },
        vessel: {
          name: `M.V. ${pickRandom(VESSEL_NAMES, this.random).toUpperCase()}`,
          imoNumber,
          bargeReference: bargeRef,
          flag: pickRandom(FLAGS, this.random),
          destination: pickRandom(['Foreign', 'Domestic', 'International'], this.random)
        },
        delivery: {
          port: pickRandom(PORTS, this.random),
          terminal: pickRandom(TERMINALS, this.random),
          dateDelivered: deliveryDate,
          dateBargeLoaded: this.random() > 0.5 ? 'N/A' : this.date(2023, 2024),
          commenced: formatTime(commencedHour, commencedMin),
          finished: formatTime(finishedHour, finishedMin)
        },
        fuel: {
          grade: fuelGrade.code,
          gradeFull: fuelGrade.name,
          viscosity,
          viscosityUnit: 'cSt @ 50°C',
          density,
          densityUnit: 'kg/m³ @ 15°C',
          sulfurContent,
          sulfurUnit: '% M/M',
          netBarrels,
          metricTons,
          temperature,
          temperatureUnit: '°F',
          flashPoint,
          flashPointUnit: '°F'
        },
        samples: {
          grades: [
            {
              grade: fuelGrade.code,
              vessel: sealNumbers.vessel,
              supplier: sealNumbers.supplier,
              vesselMarpol: sealNumbers.vesselMarpol,
              supplierMarpol: sealNumbers.supplierMarpol
            }
          ]
        },
        marpolCompliance,
        signatures: {
          master: {
            name: this.personName(),
            title: pickRandom(['MASTER', 'CHIEF ENGINEER', 'MASTER/CHIEF ENGINEER'], this.random),
            signed: this.random() > 0.2
          },
          supplier: {
            name: this.personName(),
            title: pickRandom(['FOR SELLER/TRANSPORTER', 'SUPPLIER REP', 'DELIVERY AGENT'], this.random),
            signed: this.random() > 0.2
          }
        },
        legalText: {
          bunkerReceived: 'Bunkers and representative sample(s) received in good order.',
          sellerResponsibility: 'The vessel is ultimately responsible for the debt incurred through this transaction.',
          marpolConformity: 'Seller declares that products delivered under this receipt are in conformance with Annex VI of MARPOL 73/78.',
          salesTaxExemption: 'STATE SALES TAX & FEDERAL EXCISE TAX EXEMPTION CERTIFICATES'
        }
      }
    };
  }

  /** Generate any document type */
  document(type: 'invoice' | 'receipt' | 'purchase_order' | 'bill_of_lading' | 'bunker_delivery_note'): DocumentData {
    switch (type) {
      case 'invoice':
        return this.invoice();
      case 'receipt':
        return this.receipt();
      case 'purchase_order':
        return this.purchaseOrder();
      case 'bill_of_lading':
        return this.billOfLading();
      case 'bunker_delivery_note':
        return this.bunkerDeliveryNote();
      default:
        throw new Error(`Unknown document type: ${type}`);
    }
  }

  /** Generate multiple documents of a type */
  documents(type: 'invoice' | 'receipt' | 'purchase_order' | 'bill_of_lading' | 'bunker_delivery_note', count: number): DocumentData[] {
    return Array.from({ length: count }, () => this.document(type));
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

/**
 * Create a new generator with optional seed
 */
export function createGenerator(options?: GeneratorOptions): SyntheticGenerator {
  return new SyntheticGenerator(options);
}

/**
 * Generate a single synthetic document
 */
export function generateDocument(
  type: 'invoice' | 'receipt' | 'purchase_order' | 'bill_of_lading' | 'bunker_delivery_note',
  options?: GeneratorOptions
): DocumentData {
  return createGenerator(options).document(type);
}

/**
 * Generate multiple synthetic documents
 */
export function generateDocuments(
  type: 'invoice' | 'receipt' | 'purchase_order' | 'bill_of_lading' | 'bunker_delivery_note',
  count: number,
  options?: GeneratorOptions
): DocumentData[] {
  return createGenerator(options).documents(type, count);
}

// ============================================================================
// Document Rendering
// ============================================================================

export {
  // Main function
  renderDocument,
  // Types
  type RenderOptions,
  type RenderResult,
  type BoundingBox,
  // Utilities
  generateHTML,
  renderWithPuppeteer,
  buildSystemPrompt,
  buildUserPrompt,
  generateEffectsScript,
  generateElementEffectsScript,
  generateInlineComponents,
  generateComponentStyles,
  // JSX Value Extraction (for ground truth)
  extractValuesFromJSX,
  extractValuesWithLabelFallback,
  buildGroundTruthFromExtracted,
  coerceValue,
  type ExtractedField,
} from './render';
