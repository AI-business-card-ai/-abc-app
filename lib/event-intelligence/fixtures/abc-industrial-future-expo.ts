import type { ProviderEvent, ProviderExhibitor } from '@/lib/event-intelligence/provider'

/**
 * A synthetic trade fair, for developing and demonstrating Event Intelligence
 * without touching anybody's real data.
 *
 * Every company below is **invented**. The names were chosen to be obviously
 * fictional and were checked against nothing, because the point is that no
 * claim made here attaches to a real business: the descriptions, categories,
 * halls and stands are written to exercise the matching engine, and asserting
 * them about an actual company would be defamation with extra steps.
 *
 * The set is deliberately awkward. Real exhibitor directories are not tidy, and
 * a fixture that is tidy proves nothing. It contains:
 *
 *   * clear customers, clear suppliers and clear partners, so the three
 *     directions can be seen behaving differently rather than being asserted;
 *   * companies with nothing to do with the owner's business, so "no match" has
 *     to be a real outcome rather than a low score;
 *   * a listing with no stand, and one with neither hall nor stand;
 *   * a listing so sparse there is almost nothing to reason from;
 *   * the same company listed twice under different names, identifiable by its
 *     domain, which must resolve to one company;
 *   * two companies with the same name in different countries, which must
 *     **not** be merged, only flagged.
 */

export const FIXTURE_EVENT: ProviderEvent = {
  providerRecordId: 'evt-abc-industrial-future-expo-2026',
  name: 'ABC Industrial Future Expo 2026',
  editionYear: 2026,
  organizer: 'ABC Expo Group (fictional)',
  venue: 'Messegelände Nord',
  city: 'Berlin',
  country: 'DE',
  startsOn: '2026-11-03',
  endsOn: '2026-11-06',
  websiteUrl: 'https://example.invalid/abc-industrial-future-expo',
  sourceUrl: 'https://example.invalid/abc-industrial-future-expo/about',
  sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
}

export const FIXTURE_EXHIBITORS: ProviderExhibitor[] = [
  // ── Plausible customers: they build things that need machined parts ──
  {
    providerRecordId: 'exh-001',
    companyName: 'NordWerk Robotics',
    website: 'https://nordwerk-robotics.invalid',
    country: 'DE',
    companyDescription: 'Manufacturer of robotic grippers and modular automation equipment.',
    companyCategories: ['Robotics', 'Automation'],
    hall: '6',
    stand: 'B42',
    eventCategories: ['Robotics', 'Handling technology'],
    eventDescription: 'Robotic grippers, end-of-arm tooling and modular robot cells.',
    productsServices: ['Robotic grippers', 'End-of-arm tooling', 'Robot cells'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/nordwerk',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-002',
    companyName: 'Helios Motion Systems GmbH',
    website: 'https://helios-motion.invalid',
    country: 'DE',
    companyDescription: 'Electric motors and servo drives for industrial machinery.',
    companyCategories: ['Drive technology'],
    hall: '6',
    stand: 'C18',
    eventCategories: ['Drive technology', 'Electric motors'],
    eventDescription: 'Servo drives, brushless motors and motor housings for machine builders.',
    productsServices: ['Servo drives', 'Brushless motors', 'Motor housings'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/helios',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-003',
    companyName: 'Atlas Automation',
    website: null,
    country: 'DE',
    companyDescription: 'Automation systems integrator for assembly lines.',
    companyCategories: ['Automation'],
    hall: '7',
    stand: 'A03',
    eventCategories: ['Automation', 'Assembly technology'],
    eventDescription: 'Turnkey assembly automation and conveyor systems.',
    productsServices: ['Assembly cells', 'Conveyor systems'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/atlas',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-004',
    companyName: 'NovaDrive Motors',
    website: 'https://novadrive.invalid',
    country: 'AT',
    companyDescription: 'Electric motor manufacturer for industrial and mobility applications.',
    companyCategories: ['Drive technology', 'Electric motors'],
    hall: '6',
    stand: 'D11',
    eventCategories: ['Electric motors'],
    eventDescription: 'Electric motors, rotor assemblies and aluminium motor enclosures.',
    productsServices: ['Electric motors', 'Rotor assemblies', 'Motor enclosures'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/novadrive',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-005',
    companyName: 'Kestrel Robotics Group',
    website: 'https://kestrel-robotics.invalid',
    country: 'NL',
    companyDescription: 'Collaborative robots for small-batch manufacturing.',
    companyCategories: ['Robotics'],
    hall: '6',
    stand: 'B08',
    eventCategories: ['Robotics'],
    eventDescription: 'Collaborative robot arms and lightweight machined structural parts.',
    productsServices: ['Collaborative robots', 'Robot arms'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/kestrel',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    // A hall but no stand: the directory simply does not say.
    providerRecordId: 'exh-006',
    companyName: 'Pallas Handling Systems',
    website: 'https://pallas-handling.invalid',
    country: 'DE',
    companyDescription: 'Pick-and-place handling equipment for production lines.',
    companyCategories: ['Handling technology', 'Automation'],
    hall: '7',
    stand: null,
    eventCategories: ['Handling technology'],
    eventDescription: 'Pick-and-place units and linear handling axes.',
    productsServices: ['Pick-and-place units', 'Linear axes'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/pallas',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-007',
    companyName: 'Lumen Packaging Machinery',
    website: 'https://lumen-packaging.invalid',
    country: 'IT',
    companyDescription: 'Packaging machinery for food and pharmaceutical production.',
    companyCategories: ['Packaging technology', 'Automation'],
    hall: '8',
    stand: 'A22',
    eventCategories: ['Packaging technology'],
    eventDescription: 'Filling and cartoning machines with machined aluminium frames.',
    productsServices: ['Filling machines', 'Cartoning machines'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/lumen',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },

  // ── Plausible suppliers: they sell what the owner said they buy ──
  {
    providerRecordId: 'exh-010',
    companyName: 'Vector Bearing Technologies',
    website: 'https://vector-bearing.invalid',
    country: 'DE',
    companyDescription: 'Precision and special bearings for machine tools and robotics.',
    companyCategories: ['Bearings', 'Components'],
    hall: '3',
    stand: 'F07',
    eventCategories: ['Bearings'],
    eventDescription: 'Precision bearings, special bearings and custom bearing assemblies.',
    productsServices: ['Precision bearings', 'Special bearings', 'Bearing assemblies'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/vector-bearing',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-011',
    companyName: 'Orbis Linear Bearings',
    website: 'https://orbis-linear.invalid',
    country: 'SE',
    companyDescription: 'Linear bearings, rails and guide systems.',
    companyCategories: ['Bearings', 'Linear technology'],
    hall: '3',
    stand: 'F19',
    eventCategories: ['Bearings', 'Linear technology'],
    eventDescription: 'Linear bearings, profile rails and guide carriages.',
    productsServices: ['Linear bearings', 'Profile rails', 'Guide carriages'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/orbis',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-012',
    companyName: 'Alumetal Extrusions',
    website: 'https://alumetal-extrusions.invalid',
    country: 'PL',
    companyDescription: 'Aluminium billet, extruded profiles and semi-finished stock.',
    companyCategories: ['Materials', 'Aluminium'],
    hall: '4',
    stand: 'C05',
    eventCategories: ['Materials'],
    eventDescription: 'Aluminium extrusions, billet and semi-finished aluminium stock.',
    productsServices: ['Aluminium extrusions', 'Aluminium billet'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/alumetal',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-013',
    companyName: 'Ferrite Surface Coatings',
    website: 'https://ferrite-coatings.invalid',
    country: 'CZ',
    companyDescription: 'Anodising and surface coating services for aluminium components.',
    companyCategories: ['Surface technology'],
    hall: '4',
    stand: 'D14',
    eventCategories: ['Surface technology'],
    eventDescription: 'Anodising, hard coating and surface finishing for aluminium parts.',
    productsServices: ['Anodising', 'Hard coating', 'Surface finishing'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/ferrite',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },

  // ── Plausible partners: neither buying nor selling, but adjacent ──
  {
    providerRecordId: 'exh-020',
    companyName: 'Meridian Engineering Design',
    website: 'https://meridian-design.invalid',
    country: 'DE',
    companyDescription: 'Mechanical engineering design office for automation equipment.',
    companyCategories: ['Engineering services'],
    hall: '5',
    stand: 'A11',
    eventCategories: ['Engineering services'],
    eventDescription: 'Mechanical design and design-for-manufacture consulting for automation builders.',
    productsServices: ['Mechanical design', 'Design for manufacture'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/meridian',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-021',
    companyName: 'Kappa Prototyping Studio',
    website: 'https://kappa-prototyping.invalid',
    country: 'DE',
    companyDescription: 'Rapid prototyping and small-series manufacturing support.',
    companyCategories: ['Prototyping', 'Engineering services'],
    hall: '5',
    stand: 'A19',
    eventCategories: ['Prototyping'],
    eventDescription: 'Rapid prototyping, additive manufacturing and small-series support.',
    productsServices: ['Rapid prototyping', 'Additive manufacturing'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/kappa',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    // Neither hall nor stand. The plan must cope with not knowing where they are.
    providerRecordId: 'exh-022',
    companyName: 'Certus Test Laboratories',
    website: 'https://certus-labs.invalid',
    country: 'DE',
    companyDescription: 'Materials testing and certification for machined components.',
    companyCategories: ['Testing', 'Certification'],
    hall: null,
    stand: null,
    eventCategories: ['Testing'],
    eventDescription: 'Materials testing, tolerance verification and certification services.',
    productsServices: ['Materials testing', 'Certification'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/certus',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },

  // ── Present at the fair, nothing to do with this owner ──
  {
    providerRecordId: 'exh-030',
    companyName: 'Gastro Expo Catering',
    website: 'https://gastro-expo.invalid',
    country: 'DE',
    companyDescription: 'Catering services for exhibition stands.',
    companyCategories: ['Catering'],
    hall: '1',
    stand: 'E02',
    eventCategories: ['Services'],
    eventDescription: 'Stand catering, coffee service and hospitality staff.',
    productsServices: ['Stand catering', 'Hospitality'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/gastro',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-031',
    companyName: 'Industrie Verlag Publishing',
    website: 'https://industrie-verlag.invalid',
    country: 'DE',
    companyDescription: 'Trade press and industry publications.',
    companyCategories: ['Media'],
    hall: '1',
    stand: 'E08',
    eventCategories: ['Media'],
    eventDescription: 'Trade magazines and industry yearbooks.',
    productsServices: ['Trade magazines'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/verlag',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    providerRecordId: 'exh-032',
    companyName: 'Brightline Staffing',
    website: 'https://brightline-staffing.invalid',
    country: 'DE',
    companyDescription: 'Technical recruitment and temporary staffing.',
    companyCategories: ['Recruitment'],
    hall: '1',
    stand: 'E15',
    eventCategories: ['Services'],
    eventDescription: 'Recruitment of engineers and skilled production staff.',
    productsServices: ['Recruitment'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/brightline',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    // Almost nothing to reason from. The engine must say so rather than invent.
    providerRecordId: 'exh-033',
    companyName: 'Solaris Facility Services',
    website: null,
    country: null,
    companyDescription: null,
    companyCategories: [],
    hall: '1',
    stand: 'E21',
    eventCategories: [],
    eventDescription: null,
    productsServices: [],
    listingUrl: null,
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },

  // ── Identity edge cases ──
  {
    /*
      The same company as exh-001, listed a second time under its legal name.
      Directories do this constantly — a hall listing and a category listing
      that were never reconciled. The domain says they are one company, so
      ingestion must produce one company and one presence, not two.
    */
    providerRecordId: 'exh-040',
    companyName: 'NordWerk Robotics GmbH',
    website: 'www.nordwerk-robotics.invalid/en',
    country: 'DE',
    companyDescription: 'Robotic gripper systems and automation components.',
    companyCategories: ['Robotics', 'Components'],
    hall: '6',
    stand: 'B42',
    eventCategories: ['Robotics', 'Components'],
    eventDescription: 'Gripper systems, tooling and automation components.',
    productsServices: ['Gripper systems', 'Automation components'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/nordwerk-gmbh',
    sourceUpdatedAt: '2026-09-02T09:00:00.000Z',
  },
  {
    /*
      Same name as exh-010, different country, no website to settle it. These
      may be one international group or two unrelated firms, and ABC does not
      know which. It must keep them apart and record the doubt — a silent merge
      here would put one company's stand against another company's products.
    */
    providerRecordId: 'exh-041',
    companyName: 'Vector Bearing Technologies',
    website: null,
    country: 'US',
    companyDescription: 'Bearing distribution for industrial maintenance.',
    companyCategories: ['Bearings'],
    hall: '3',
    stand: 'G02',
    eventCategories: ['Bearings'],
    eventDescription: 'Distribution of industrial bearings and maintenance spares.',
    productsServices: ['Bearing distribution', 'Maintenance spares'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/vector-bearing-us',
    sourceUpdatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    /*
      Same name and same country as exh-003, and neither has a website. Name
      plus a country both listings agree on is the weakest merge ABC will make
      on its own, and it is made here rather than leaving an obvious duplicate
      in a list somebody has to walk around a fair with.
    */
    providerRecordId: 'exh-042',
    companyName: 'Atlas Automation',
    website: null,
    country: 'DE',
    companyDescription: 'Automation systems integrator for assembly lines.',
    companyCategories: ['Automation', 'Assembly technology'],
    hall: '7',
    stand: 'A03',
    eventCategories: ['Automation'],
    eventDescription: 'Assembly automation, conveyor systems and line integration.',
    productsServices: ['Assembly cells', 'Conveyor systems', 'Line integration'],
    listingUrl: 'https://example.invalid/abc-industrial-future-expo/exhibitors/atlas-2',
    sourceUpdatedAt: '2026-09-02T09:00:00.000Z',
  },
]
