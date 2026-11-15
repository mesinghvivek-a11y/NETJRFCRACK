// Ready-made syllabi that can be loaded in one tap from Admin > Syllabus.
export interface PresetUnit { name: string; topics: string[] }
export interface Preset {
  id: string; name: string; nta_code: string; id_prefix: string;
  questions_per_paper: number; minutes_per_paper: number; units: PresetUnit[];
}

export const PRESETS: Preset[] = [
  { id: "geography", name: "Geography", nta_code: "80", id_prefix: "geo", questions_per_paper: 100, minutes_per_paper: 120, units: [
  {
    "name": "Geomorphology",
    "topics": [
      "Continental Drift",
      "Plate Tectonics",
      "Endogenetic and Exogenetic Forces",
      "Denudation and Weathering",
      "Geomorphic Cycle (Davis and Penck)",
      "Slope Development: Theories and Processes",
      "Earth Movements: Seismicity",
      "Earth Movements: Folding and Faulting",
      "Vulcanicity",
      "Landform Occurrence",
      "Geomorphic Hazards: Earthquakes and Volcanoes",
      "Geomorphic Hazards: Landslides and Avalanches"
    ]
  },
  {
    "name": "Climatology",
    "topics": [
      "Composition and Structure of Atmosphere",
      "Insolation and Heat Budget of Earth",
      "Temperature",
      "Pressure and Winds",
      "Air Masses and Fronts",
      "Atmospheric Circulation (General and Upper Air)",
      "Cyclones and Anticyclones (Tropical and Temperate)",
      "Koppen Climatic Classification",
      "Thornthwaite Climatic Classification",
      "ENSO Events (El Nino, La Nina, Southern Oscillation)",
      "Meteorological Hazards: Cyclones, Thunderstorms, Tornadoes, Hailstorms",
      "Meteorological Hazards: Heat and Cold Waves, Drought, Cloudburst, GLOF",
      "Climate Change: Evidences and Causes in the Past",
      "Human Impact on Global Climate"
    ]
  },
  {
    "name": "Oceanography",
    "topics": [
      "Relief of Oceans",
      "Temperature of Oceans",
      "Density and Salinity",
      "Warm and Cold Currents",
      "Waves",
      "Tides",
      "Sea Level Changes",
      "Hazards: Tsunami",
      "Hazards: Cyclone"
    ]
  },
  {
    "name": "Geography of Environment",
    "topics": [
      "Ecosystem: Geographic Classification",
      "Human Ecology",
      "Trophic Levels and Energy Flows",
      "Biogeochemical Cycles (Geo-chemical, Carbon, Nitrogen, Oxygen)",
      "Food Chain, Food Web and Ecological Pyramid",
      "Human Interaction and Impacts",
      "Environmental Ethics and Deep Ecology",
      "Global Warming and Urban Heat Island",
      "Atmospheric Pollution",
      "Water Pollution",
      "Land Degradation",
      "National Programmes, Legal Framework and Environmental Policy",
      "Brundtland Commission, Agenda 21 and Sustainable Development Goals",
      "Kyoto Protocol and Paris Agreement"
    ]
  },
  {
    "name": "Population and Settlement Geography",
    "topics": [
      "Sources of Population Data",
      "World Population Distribution",
      "World Population Growth",
      "Demographic Transition",
      "Theories of Population Growth (Malthus, Sadler, Ricardo)",
      "Fertility Analysis",
      "Mortality Analysis",
      "Migration",
      "Population Composition and Characteristics",
      "Population Policies",
      "Rural Settlements: Types, Patterns and Distribution",
      "Contemporary Problems of Rural Settlements",
      "Theories of Origin of Towns",
      "Urbanization in Developed and Developing Countries",
      "Urban Systems (Primate City, Rank Size Rule)",
      "Central Place Theories (Christaller and Losch)",
      "Internal Structure of City and Urban Land Use Models",
      "Megacities, Global Cities and Edge Cities",
      "Changing Urban Forms",
      "Social Segregation and Urban Social Area Analysis",
      "Manifestation of Poverty in the City"
    ]
  },
  {
    "name": "Geography of Economic Activities and Regional Development",
    "topics": [
      "Spatial Organisation of Economic Activities",
      "Natural Resources: Classification, Distribution and Problems",
      "Natural Resources Management",
      "World Energy Crises",
      "Land Capability Classification and Land Use Planning",
      "Crop Combination Regions (Weaver, Doi, Rafiullah)",
      "Crop Diversification",
      "Von Thunen's Model",
      "Agricultural Productivity: Measurement, Determinants and Regional Variations",
      "Agricultural Systems of the World",
      "Classification and Location Factors of Industries",
      "Theories of Industrial Location",
      "World Industrial Regions",
      "Globalisation and Manufacturing in Less Developed Countries",
      "Tourism Industry",
      "ICT and Knowledge Production Industries",
      "Spatial Interaction Theories and Models",
      "Connectivity and Accessibility Measures",
      "Gravity Model and Spatial Flow Models",
      "WTO, Globalisation, Liberalisation and World Trade Patterns",
      "Inter and Intra Regional Cooperation and Trade",
      "Typology of Regions (Formal and Functional)",
      "World Regional Disparities",
      "Theories of Regional Development",
      "Dependency Theory and Global Economic Blocs",
      "Regional Development and Social Movements in India"
    ]
  },
  {
    "name": "Cultural, Social and Political Geography",
    "topics": [
      "Culture, Cultural Complexes, Areas and Regions",
      "Cultural Heritage",
      "Cultural Ecology and Cultural Convergence",
      "Social Structure and Processes",
      "Social Well-being, Quality of Life and Social Exclusion",
      "Spatial Distribution of Social Groups in India",
      "Environment, Human Health and Disease Ecology",
      "Nutritional Status",
      "Health Care Planning, Policies and Medical Tourism in India",
      "Boundaries and Frontiers",
      "Heartland and Rimland Theories",
      "Trends and Developments in Political Geography",
      "Geography of Federalism",
      "Electoral Reforms and Electoral Behaviour",
      "Geopolitics of Climate Change and World Resources",
      "Geopolitics of Indian Ocean",
      "Regional Organisations of Cooperation"
    ]
  },
  {
    "name": "Geographic Thought",
    "topics": [
      "Greek and Roman Scholars",
      "Arab, Chinese and Indian Scholars",
      "Contributions of Geographers (Varenius, Kant, Humboldt, Ritter, Schaefer, Hartshorne)",
      "Impact of Darwinian Theory",
      "Contemporary Trends in Indian Geography",
      "Major Geographic Traditions",
      "Dualisms in Geographic Studies",
      "Paradigm Shift",
      "Perspectives in Geography"
    ]
  },
  {
    "name": "Geographical Techniques",
    "topics": [
      "Sources of Geographic Information and Data",
      "Types of Maps",
      "Techniques of Map Making",
      "Data Representation on Maps and Diagrams",
      "GIS Database and Data Formats",
      "Functions of GIS",
      "Digital Elevation Model",
      "Georeferencing: Coordinates, Projections and Datum",
      "GIS Applications",
      "Basics of Remote Sensing",
      "Image Interpretation and Photogrammetry",
      "Digital Image Processing and Remote Sensing Applications",
      "GPS",
      "Central Tendency, Dispersion and Inequalities",
      "Sampling and Hypothesis Testing",
      "Time Series, Correlation and Regression",
      "Indices, Composite Index, PCA and Cluster Analysis",
      "Morphometric Analysis",
      "Profiles, Slope Analysis and Hypsometric Curves"
    ]
  },
  {
    "name": "Geography of India",
    "topics": [
      "Physiographic Regions",
      "Drainage System",
      "Seasonal Weather and Climatic Divisions",
      "Indian Monsoon",
      "Jet Streams and Himalayan Cryosphere",
      "Natural Resources: Soil and Vegetation",
      "Natural Resources: Water, Mineral and Marine",
      "Population Distribution, Growth and Composition",
      "Determinants of Population and Population Policies",
      "Agriculture: Production, Productivity and Yield",
      "Major Crop Regions and Regional Variations",
      "Factors Affecting Indian Agriculture",
      "Agro-Climatic Zones, Green Revolution and Food Security",
      "Industrial Development, Regions and Policies",
      "Transport Networks",
      "Internal and External Trade",
      "Regional Development Planning",
      "Globalisation and Indian Economy",
      "Natural Disasters in India"
    ]
  }
] },
  { id: "paper1", name: "Paper 1: Teaching and Research Aptitude", nta_code: "00", id_prefix: "p1", questions_per_paper: 50, minutes_per_paper: 60, units: [
  {
    "name": "Teaching Aptitude",
    "topics": [
      "Teaching: Concept, Objectives, Levels and Requirements",
      "Learner's Characteristics and Individual Differences",
      "Factors Affecting Teaching",
      "Methods of Teaching in Higher Education",
      "Teaching Support System",
      "Evaluation Systems"
    ]
  },
  {
    "name": "Research Aptitude",
    "topics": [
      "Research: Meaning, Types, Characteristics, Positivism and Post-positivism",
      "Methods of Research",
      "Steps of Research",
      "Thesis and Article Writing: Format and Referencing",
      "Application of ICT in Research",
      "Research Ethics"
    ]
  },
  {
    "name": "Comprehension",
    "topics": [
      "Reading Comprehension"
    ]
  },
  {
    "name": "Communication",
    "topics": [
      "Communication: Meaning, Types and Characteristics",
      "Effective Communication",
      "Barriers to Effective Communication",
      "Mass Media and Society"
    ]
  },
  {
    "name": "Mathematical Reasoning and Aptitude",
    "topics": [
      "Types of Reasoning",
      "Number Series, Letter Series, Codes and Relationships",
      "Mathematical Aptitude"
    ]
  },
  {
    "name": "Logical Reasoning",
    "topics": [
      "Structure of Arguments",
      "Deductive and Inductive Reasoning",
      "Analogies",
      "Venn Diagrams",
      "Indian Logic: Pramanas",
      "Anumana, Vyapti and Hetvabhasas"
    ]
  },
  {
    "name": "Data Interpretation",
    "topics": [
      "Sources, Acquisition and Classification of Data",
      "Quantitative and Qualitative Data",
      "Graphical Representation and Mapping of Data",
      "Data Interpretation",
      "Data and Governance"
    ]
  },
  {
    "name": "Information and Communication Technology (ICT)",
    "topics": [
      "ICT: Abbreviations and Terminology",
      "Internet, Intranet, E-mail and Conferencing",
      "Digital Initiatives in Higher Education",
      "ICT and Governance"
    ]
  },
  {
    "name": "People, Development and Environment",
    "topics": [
      "Development and Environment: MDGs and SDGs",
      "Human and Environment Interaction",
      "Environmental Issues and Pollution",
      "Impacts of Pollutants on Human Health",
      "Natural and Energy Resources",
      "Natural Hazards and Disasters",
      "Environmental Laws, Policies and International Agreements"
    ]
  },
  {
    "name": "Higher Education System",
    "topics": [
      "Ancient Institutions of Higher Learning",
      "Higher Education and Research since Independence",
      "Oriental, Conventional and Non-conventional Programmes",
      "Professional, Technical and Skill Based Education",
      "Value Education and Environmental Education",
      "Policies, Governance and Administration"
    ]
  }
] },
];
