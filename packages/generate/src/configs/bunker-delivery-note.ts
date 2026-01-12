/**
 * Bunker Delivery Note (BDN) Configuration
 *
 * Marine fuel delivery receipt documenting the transfer of bunker fuel
 * from supplier to vessel. Used in maritime shipping industry.
 */

import type { DocumentGenerationConfig } from '../document-config';

export const bunkerDeliveryNoteConfig: DocumentGenerationConfig = {
  documentType: 'bunker_delivery_note',
  description:
    'Marine fuel delivery receipt documenting the transfer of bunker fuel from supplier to vessel. Required for MARPOL compliance and fuel quality verification.',
  category: 'maritime',

  fields: {
    // =========================================================================
    // SUPPLIER INFORMATION
    // =========================================================================
    supplier_name: {
      label: 'Supplier Name',
      description: 'Company name of the bunker fuel supplier',
      type: 'text',
      inclusionRate: 100,
      constraints: {
        examples: [
          'GCC Supply & Trading',
          'Peninsula Petroleum',
          'World Fuel Services',
          'Monjasa',
          'Bunker Holding',
          'Aegean Marine',
          'Cockett Marine',
          'Minerva Bunkering',
        ],
      },
    },
    supplier_address: {
      label: 'Supplier Address',
      description: 'Full address of supplier including city/state/country',
      type: 'address',
      inclusionRate: 85,
      constraints: {
        includeStreet: true,
        includeCity: true,
        includeState: true,
        includePostal: true,
        includeCountry: false,
      },
    },
    supplier_phone: {
      label: 'Supplier Phone',
      description: 'Contact phone number for supplier',
      type: 'phone',
      inclusionRate: 70,
    },
    supplier_website: {
      label: 'Supplier Website',
      description: 'Supplier company website URL',
      type: 'text',
      inclusionRate: 50,
      constraints: {
        examples: ['www.gccsupply.com', 'www.peninsulapetroleum.com'],
      },
    },

    // =========================================================================
    // DOCUMENT REFERENCE NUMBERS
    // =========================================================================
    bdn_number: {
      label: 'BDN Number',
      description: 'Primary bunker delivery note reference number',
      type: 'text',
      inclusionRate: 100,
      constraints: {
        pattern: 'XXX NNNNNN',
        examples: ['PHY 123456', 'BDN-2024-001234', 'GCC/BDN/24/0892'],
        monospace: true,
      },
    },
    secondary_reference: {
      label: 'Secondary Reference',
      description: 'Additional reference number (internal tracking)',
      type: 'text',
      inclusionRate: 60,
      constraints: {
        pattern: 'NNNNNN',
        examples: ['789012', 'REF-456789'],
        monospace: true,
      },
    },

    // =========================================================================
    // VESSEL INFORMATION
    // =========================================================================
    vessel_name: {
      label: 'Vessel Name',
      description: 'Name of the receiving vessel (usually with M.V. or M/V prefix)',
      type: 'text',
      inclusionRate: 100,
      constraints: {
        uppercase: true,
        examples: [
          'M.V. PALENA',
          'M.V. EVER GIVEN',
          'M/V NORDIC ACE',
          'M.V. MAERSK ALABAMA',
          'M.V. PACIFIC PIONEER',
        ],
      },
    },
    vessel_imo: {
      label: 'IMO Number',
      description: 'International Maritime Organization vessel identification number (7 digits)',
      type: 'text',
      inclusionRate: 90,
      constraints: {
        pattern: 'NNNNNNN',
        examples: ['9811000', '9786124', '9321483'],
        monospace: true,
      },
    },
    vessel_flag: {
      label: 'Flag State',
      description: 'Country of vessel registration',
      type: 'enum',
      inclusionRate: 75,
      constraints: {
        weightedOptions: [
          { value: 'Panama', weight: 25 },
          { value: 'Liberia', weight: 20 },
          { value: 'Marshall Islands', weight: 15 },
          { value: 'Singapore', weight: 15 },
          { value: 'Hong Kong', weight: 10 },
          { value: 'Malta', weight: 5 },
          { value: 'Bahamas', weight: 5 },
          { value: 'Cyprus', weight: 3 },
          { value: 'Greece', weight: 2 },
        ],
      },
    },
    vessel_destination: {
      label: 'Destination',
      description: 'Vessel destination classification for tax purposes',
      type: 'enum',
      inclusionRate: 65,
      constraints: {
        options: ['Foreign', 'Domestic', 'International'],
      },
    },
    barge_name: {
      label: 'Barge/Bunker Vessel',
      description: 'Name of delivering barge or bunker vessel',
      type: 'text',
      inclusionRate: 70,
      constraints: {
        examples: [
          'Kirby 28750',
          'Moran 401',
          'Reinauer 220',
          'K-Sea 105',
          'Penn Maritime 32',
          'MT Petro Star',
        ],
      },
    },

    // =========================================================================
    // DELIVERY LOCATION & TIMING
    // =========================================================================
    port: {
      label: 'Port of Delivery',
      description: 'Port where bunkering took place',
      type: 'text',
      inclusionRate: 100,
      constraints: {
        examples: [
          'Houston',
          'Singapore',
          'Rotterdam',
          'Fujairah',
          'Hong Kong',
          'Los Angeles',
          'Galveston',
          'Panama',
          'Gibraltar',
        ],
      },
    },
    terminal: {
      label: 'Terminal',
      description: 'Specific terminal or berth within port',
      type: 'text',
      inclusionRate: 65,
      constraints: {
        examples: [
          'Barbours Cut Terminal #1',
          'Bayport Terminal',
          'Manchester Terminal',
          'Eastern Anchorage A',
          'OPL',
        ],
      },
    },
    delivery_date: {
      label: 'Date Delivered',
      description: 'Date when fuel was delivered to vessel',
      type: 'date',
      inclusionRate: 100,
      constraints: {
        format: 'MM/DD/YYYY',
        relativeRange: '-60d to today',
      },
    },
    barge_loaded_date: {
      label: 'Date Barge Loaded',
      description: 'Date when barge was loaded with fuel (may be N/A)',
      type: 'date',
      inclusionRate: 55,
      constraints: {
        format: 'MM/DD/YYYY',
        relativeRange: '-65d to -1d',
      },
    },
    time_commenced: {
      label: 'Commenced',
      description: 'Time bunkering operation started (24hr format)',
      type: 'time',
      inclusionRate: 95,
      constraints: {
        format: 'HHMM',
        handwritten: 60,
      },
    },
    time_finished: {
      label: 'Finished',
      description: 'Time bunkering operation completed (24hr format)',
      type: 'time',
      inclusionRate: 95,
      constraints: {
        format: 'HHMM',
        handwritten: 60,
      },
      dependsOn: {
        field: 'time_commenced',
        condition: 'present',
      },
    },

    // =========================================================================
    // FUEL PRODUCT INFORMATION
    // =========================================================================
    fuel_grade: {
      label: 'Product Grade',
      description: 'Type/grade code of bunker fuel delivered',
      type: 'enum',
      inclusionRate: 100,
      constraints: {
        weightedOptions: [
          { value: 'VLSFO', weight: 35 },
          { value: 'HSFO', weight: 15 },
          { value: 'MGO', weight: 20 },
          { value: 'LSMGO', weight: 15 },
          { value: 'IFO 380', weight: 8 },
          { value: 'IFO 180', weight: 4 },
          { value: 'DMA', weight: 2 },
          { value: 'DMB', weight: 1 },
        ],
      },
    },
    fuel_grade_full: {
      label: 'Product Name',
      description: 'Full name of fuel grade',
      type: 'text',
      inclusionRate: 70,
      constraints: {
        examples: [
          'Very Low Sulfur Fuel Oil',
          'High Sulfur Fuel Oil',
          'Marine Gas Oil',
          'Low Sulfur Marine Gas Oil',
          'Intermediate Fuel Oil 380',
        ],
      },
    },
    quantity_mt: {
      label: 'Quantity (MT)',
      description: 'Quantity delivered in metric tons',
      type: 'number',
      inclusionRate: 100,
      constraints: {
        min: 50,
        max: 5000,
        decimals: 3,
        unit: 'MT',
        handwritten: 40, // 40% chance to appear handwritten
      },
    },
    quantity_barrels: {
      label: 'Net Barrels',
      description: 'Quantity delivered in barrels',
      type: 'number',
      inclusionRate: 75,
      constraints: {
        min: 350,
        max: 35000,
        decimals: 2,
        unit: 'BBL',
        handwritten: 40,
      },
    },

    // =========================================================================
    // FUEL QUALITY SPECIFICATIONS
    // =========================================================================
    density: {
      label: 'Density @ 15°C',
      description: 'Fuel density at standard temperature',
      type: 'number',
      inclusionRate: 90,
      constraints: {
        min: 820,
        max: 991,
        decimals: 1,
        unit: 'kg/m³',
        handwritten: 35,
      },
    },
    viscosity: {
      label: 'Viscosity @ 50°C',
      description: 'Fuel viscosity measurement',
      type: 'number',
      inclusionRate: 85,
      constraints: {
        min: 2,
        max: 700,
        decimals: 2,
        unit: 'cSt',
        handwritten: 35,
      },
    },
    sulfur_content: {
      label: 'Sulfur Content',
      description: 'Sulfur percentage in fuel (critical for MARPOL compliance)',
      type: 'number',
      inclusionRate: 95,
      constraints: {
        min: 0.05,
        max: 3.5,
        decimals: 2,
        unit: '% m/m',
        handwritten: 30,
      },
    },
    temperature: {
      label: 'Temperature',
      description: 'Fuel temperature during delivery',
      type: 'number',
      inclusionRate: 70,
      constraints: {
        min: 70,
        max: 150,
        decimals: 1,
        unit: '°F',
        handwritten: 50,
      },
    },
    flash_point: {
      label: 'Flash Point',
      description: 'Minimum flash point temperature',
      type: 'number',
      inclusionRate: 60,
      constraints: {
        min: 60,
        max: 280,
        decimals: 0,
        unit: '°F',
        handwritten: 40,
      },
    },

    // =========================================================================
    // MARPOL SAMPLE INFORMATION
    // =========================================================================
    sample_seal_vessel: {
      label: 'Vessel Sample Seal',
      description: 'Sample seal number retained by vessel',
      type: 'text',
      inclusionRate: 85,
      constraints: {
        pattern: 'NNNNNNN',
        examples: ['1330456', '1330457'],
        monospace: true,
        handwritten: 45,
      },
    },
    sample_seal_supplier: {
      label: 'Supplier Sample Seal',
      description: 'Sample seal number retained by supplier',
      type: 'text',
      inclusionRate: 85,
      constraints: {
        pattern: 'NNNNNNN',
        monospace: true,
        handwritten: 45,
      },
    },
    sample_seal_marpol_vessel: {
      label: 'MARPOL Sample (Vessel)',
      description: 'MARPOL compliance sample seal - vessel copy',
      type: 'text',
      inclusionRate: 80,
      constraints: {
        pattern: 'NNNNNNN',
        monospace: true,
        handwritten: 45,
      },
    },
    sample_seal_marpol_supplier: {
      label: 'MARPOL Sample (Supplier)',
      description: 'MARPOL compliance sample seal - supplier copy',
      type: 'text',
      inclusionRate: 80,
      constraints: {
        pattern: 'NNNNNNN',
        monospace: true,
        handwritten: 45,
      },
    },

    // =========================================================================
    // MARPOL COMPLIANCE
    // =========================================================================
    marpol_3_5_percent: {
      label: 'MARPOL 3.5% Compliance',
      description: 'Fuel meets 3.5% sulfur limit (outside ECA)',
      type: 'boolean',
      inclusionRate: 75,
    },
    marpol_0_5_percent: {
      label: 'MARPOL 0.5% Compliance',
      description: 'Fuel meets 0.5% global sulfur cap (IMO 2020)',
      type: 'boolean',
      inclusionRate: 85,
    },
    marpol_0_1_percent: {
      label: 'MARPOL 0.1% Compliance',
      description: 'Fuel meets 0.1% sulfur limit (ECA zones)',
      type: 'boolean',
      inclusionRate: 60,
    },

    // =========================================================================
    // SIGNATURES
    // =========================================================================
    master_name: {
      label: 'Master/Chief Engineer Name',
      description: 'Name of vessel master or chief engineer',
      type: 'text',
      inclusionRate: 85,
    },
    master_title: {
      label: 'Master Title',
      description: 'Title of signing officer',
      type: 'enum',
      inclusionRate: 80,
      constraints: {
        options: ['MASTER', 'CHIEF ENGINEER', 'MASTER/CHIEF ENGINEER'],
      },
    },
    master_signature: {
      label: 'Master Signature',
      description: 'Signature of vessel master or chief engineer',
      type: 'signature',
      inclusionRate: 90,
    },
    supplier_rep_name: {
      label: 'Supplier Representative',
      description: 'Name of supplier delivery representative',
      type: 'text',
      inclusionRate: 85,
    },
    supplier_signature: {
      label: 'Supplier Signature',
      description: 'Signature of supplier representative',
      type: 'signature',
      inclusionRate: 90,
    },

    // =========================================================================
    // LEGAL TEXT
    // =========================================================================
    bunker_received_text: {
      label: 'Bunker Received Statement',
      description: 'Standard acknowledgment text for fuel receipt',
      type: 'text',
      inclusionRate: 80,
      constraints: {
        examples: [
          'Bunkers and representative sample(s) received in good order.',
          'Fuel delivered and samples received in satisfactory condition.',
        ],
      },
    },
    marpol_conformity_text: {
      label: 'MARPOL Conformity Statement',
      description: 'Declaration of MARPOL compliance',
      type: 'text',
      inclusionRate: 75,
      constraints: {
        examples: [
          'Seller declares that products delivered under this receipt are in conformance with Annex VI of MARPOL 73/78.',
        ],
      },
    },
    remarks: {
      label: 'Remarks',
      description: 'Additional notes or observations',
      type: 'text',
      inclusionRate: 35,
      constraints: {
        maxLength: 200,
        examples: [
          'Delivery completed without incident.',
          'Weather: Calm seas, good visibility.',
          'Quantity adjusted per vessel request.',
        ],
      },
    },
  },

  sections: [
    {
      id: 'header',
      name: 'Document Header',
      description: 'Supplier branding, logo, and document reference numbers',
      fields: ['supplier_name', 'supplier_address', 'supplier_phone', 'supplier_website', 'bdn_number', 'secondary_reference'],
      inclusionRate: 100,
      preferredLayout: 'header',
    },
    {
      id: 'vessel_info',
      name: 'Vessel Information',
      description: 'Details of the receiving vessel',
      fields: ['vessel_name', 'vessel_imo', 'vessel_flag', 'vessel_destination', 'barge_name'],
      inclusionRate: 100,
      preferredLayout: 'columns',
    },
    {
      id: 'delivery_details',
      name: 'Delivery Details',
      description: 'Location and timing of delivery',
      fields: ['port', 'terminal', 'delivery_date', 'barge_loaded_date', 'time_commenced', 'time_finished'],
      inclusionRate: 100,
      preferredLayout: 'fields',
    },
    {
      id: 'product_info',
      name: 'Product Information',
      description: 'Fuel product and quantity',
      fields: ['fuel_grade', 'fuel_grade_full', 'quantity_mt', 'quantity_barrels'],
      inclusionRate: 100,
      preferredLayout: 'table',
    },
    {
      id: 'quality_specs',
      name: 'Quality Specifications',
      description: 'Technical fuel quality measurements',
      fields: ['density', 'viscosity', 'sulfur_content', 'temperature', 'flash_point'],
      inclusionRate: 85,
      preferredLayout: 'table',
      bordered: true,
    },
    {
      id: 'samples',
      name: 'Sample Information',
      description: 'MARPOL sample seal numbers',
      fields: ['sample_seal_vessel', 'sample_seal_supplier', 'sample_seal_marpol_vessel', 'sample_seal_marpol_supplier'],
      inclusionRate: 85,
      preferredLayout: 'table',
    },
    {
      id: 'marpol_compliance',
      name: 'MARPOL Compliance',
      description: 'Sulfur compliance checkboxes per MARPOL Annex VI',
      fields: ['marpol_3_5_percent', 'marpol_0_5_percent', 'marpol_0_1_percent'],
      inclusionRate: 75,
      preferredLayout: 'form',
    },
    {
      id: 'signatures',
      name: 'Signatures',
      description: 'Acknowledgment signatures from both parties',
      fields: ['master_name', 'master_title', 'master_signature', 'supplier_rep_name', 'supplier_signature'],
      inclusionRate: 95,
      preferredLayout: 'signature-block',
    },
    {
      id: 'legal',
      name: 'Legal Statements',
      description: 'Legal acknowledgments and compliance declarations',
      fields: ['bunker_received_text', 'marpol_conformity_text'],
      inclusionRate: 70,
      preferredLayout: 'list',
      hideTitle: true,
    },
    {
      id: 'remarks',
      name: 'Remarks',
      description: 'Additional notes',
      fields: ['remarks'],
      inclusionRate: 35,
      preferredLayout: 'freeform',
    },
  ],

  layoutHints: {
    preferredPatterns: [
      'HeaderSplit',
      'HeaderWithLogo',
      'FieldsGrid',
      'FieldsTwoColumnStacked',
      'TableBordered',
      'TableCompact',
      'SignatureSideBySide',
      'FooterSimple',
    ],
    hasHeader: true,
    hasFooter: true,
    pageCount: { min: 1, max: 1 },
    orientation: 'portrait',
    pageSize: 'letter',
    margins: 'normal',
    includeStamps: {
      types: ['StampReceived', 'StampApproved'],
      rate: 20,
      position: 'top-right',
    },
    includeBarcodes: {
      types: ['Barcode', 'BarcodeWithLabel'],
      rate: 35,
      position: 'top-right',
    },
    includeLogo: {
      types: ['Logo'],
      rate: 75,
      position: 'top-left',
    },
    colorScheme: 'minimal-color',
    density: 'compact',
  },

  meta: {
    version: '1.0.0',
    author: 'doclo-sdk',
    updated: '2024-01-15',
    notes: 'Bunker delivery notes are required for MARPOL compliance and fuel quality verification in maritime shipping.',
  },
};
