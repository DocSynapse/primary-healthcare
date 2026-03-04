import fs from 'node:fs/promises';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PenyakitEntry {
  id: string;
  nama: string;
  icd10: string;
  kompetensi: string;
  body_system: string;
  definisi: string;
  gejala_klinis: string[];
  pemeriksaan_fisik: string[];
  diagnosis_banding: string[];
  red_flags: string[];
  terapi: Array<{ obat: string; dosis: string; frek: string }>;
  kriteria_rujukan: string;
}

export interface EpiWeightEntry {
  weight: number;
  cases_per_month: number;
  prevalence_pct: number;
  total_annual: number;
  nama: string;
  male_pct: number;
  female_pct: number;
}

// ── Synonym Map (Normalization Layer) ──────────────────────────────────────────

const SYNONYM_MAP: Record<string, string> = {
  // Common terms to medical terms
  "panas": "demam",
  "puyeng": "pusing",
  "mumet": "pusing",
  "cekot-cekot": "nyeri kepala",
  "ngelu": "pusing",
  "mules": "nyeri perut",
  "sebah": "kembung",
  "mencret": "diare",
  "pilek": "rhinitis",
  "bindeng": "hidung tersumbat",
  "serak": "disfonia",
  "sesek": "sesak napas",
  "menggeh-menggeh": "sesak napas",
  "pegel": "myalgia",
  "linu": "nyeri sendi",
  "senut-senut": "nyeri",
  "borok": "ulkus",
  "bisul": "abses",
  "gringgingen": "parastesia",
  "kesemutan": "parastesia",
  "bloon": "penurunan kesadaran",
  "nglindur": "delirium",
  "muntaber": "gastroenteritis",
  "batuk pilek": "common cold",
  "bapil": "common cold",
  "ispa": "infeksi saluran pernapasan akut"
};

export interface DrugMapping {
  generik: string;
  alias: string[];
  stok_match: string[];
  kategori: string;
}

export interface StockEntry {
  id: string;
  nama_obat: string;
  satuan: string;
  stok_tersedia: number;
  status: string;
}

// ── Provider Implementation ──────────────────────────────────────────────────

class CDSSDataProvider {
  private static instance: CDSSDataProvider;
  private diseases: PenyakitEntry[] = [];
  private drugs: DrugMapping[] = [];
  private stock: StockEntry[] = [];
  private diseaseMap: Map<string, PenyakitEntry> = new Map();
  private icdMap: Map<string, PenyakitEntry> = new Map();
  private drugAliasMap: Map<string, string> = new Map(); 
  private drugDataMap: Map<string, DrugMapping> = new Map(); 
  private stockMap: Map<string, StockEntry[]> = new Map(); // normalized_name -> stock items
  private epiWeights: Record<string, EpiWeightEntry> = {};
  private initialized = false;

  private constructor() {}

  public static getInstance(): CDSSDataProvider {
    if (!CDSSDataProvider.instance) {
      CDSSDataProvider.instance = new CDSSDataProvider();
    }
    return CDSSDataProvider.instance;
  }

  /**
   * Pre-loads all clinical data into memory and builds optimized indexes.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const dataDir = path.join(process.cwd(), 'public', 'data');
      const dbDir = path.join(process.cwd(), 'database');
      
      // Load files in parallel
      const [rawPenyakit, rawEpi, rawDrugs, rawStock, rawExtensions] = await Promise.all([
        fs.readFile(path.join(dataDir, 'penyakit.json'), 'utf-8'),
        fs.readFile(path.join(dataDir, 'epidemiology_weights_v2.json'), 'utf-8'),
        fs.readFile(path.join(dbDir, 'drug.json'), 'utf-8'),
        fs.readFile(path.join(dbDir, 'stock.json'), 'utf-8'),
        fs.readFile(path.join(dbDir, 'icdx-extensions.json'), 'utf-8')
      ]);

      // Parse Diseases
      const parsedPenyakit = JSON.parse(rawPenyakit);
      this.diseases = Array.isArray(parsedPenyakit) ? parsedPenyakit : (parsedPenyakit.penyakit || []);
      
      this.diseaseMap.clear();
      this.icdMap.clear();
      for (const d of this.diseases) {
        this.diseaseMap.set(d.id, d);
        this.icdMap.set(d.icd10, d);
        if (d.icd10.includes('.')) {
          const base = d.icd10.split('.')[0];
          if (!this.icdMap.has(base)) this.icdMap.set(base, d);
        }
      }

      // Add ICDX Extensions
      try {
        const extensions = JSON.parse(rawExtensions) as Array<{code: string, display: string}>;
        for (const ext of extensions) {
          if (!this.icdMap.has(ext.code)) {
            // Map extensions to a generic clinical entry if needed, or just track codes
            this.icdMap.set(ext.code, { icd10: ext.code, nama: ext.display } as any);
          }
        }
      } catch (e) { console.warn('[CDSS-Data] Failed to parse extensions'); }

      // Parse Drugs
      const parsedDrugs = JSON.parse(rawDrugs);
      this.drugs = parsedDrugs.mappings || [];
      this.drugAliasMap.clear();
      this.drugDataMap.clear();
      for (const drug of this.drugs) {
        const lowerGenerik = drug.generik.toLowerCase();
        this.drugDataMap.set(lowerGenerik, drug);
        this.drugAliasMap.set(lowerGenerik, lowerGenerik);
        for (const alias of drug.alias) this.drugAliasMap.set(alias.toLowerCase(), lowerGenerik);
        for (const stok of drug.stok_match) this.drugAliasMap.set(stok.toLowerCase(), lowerGenerik);
      }

      // Parse Stock
      const parsedStock = JSON.parse(rawStock);
      this.stock = parsedStock.stok_obat || [];
      this.stockMap.clear();
      for (const item of this.stock) {
        // Try to match stock item to a known generic drug
        const normalizedName = this.normalizeDrugName(item.nama_obat);
        if (!this.stockMap.has(normalizedName)) this.stockMap.set(normalizedName, []);
        this.stockMap.get(normalizedName)!.push(item);
      }

      // Parse Epi Weights
      const parsedEpi = JSON.parse(rawEpi);
      this.epiWeights = parsedEpi.weights || {};

      this.initialized = true;
      console.log(`[CDSS-Data] Initialized: ${this.diseases.length} diseases, ${this.drugs.length} drug mappings, ${this.stock.length} stock items.`);
    } catch (error) {
      console.error('[CDSS-Data] Initialization failed:', error);
      throw error;
    }
  }

  public getStockForItem(drugName: string): StockEntry[] {
    const genericName = this.normalizeDrugName(drugName);
    return this.stockMap.get(genericName) || [];
  }

  public isItemInStock(drugName: string): boolean {
    const stock = this.getStockForItem(drugName);
    return stock.some(s => s.stok_tersedia > 0);
  }

  public getDiseases(): PenyakitEntry[] {
    return this.diseases;
  }

  public getDrugs(): DrugMapping[] {
    return this.drugs;
  }

  /**
   * Translates common drug names/brands to generic names (e.g., "PCT" -> "Paracetamol").
   */
  public normalizeDrugName(name: string): string {
    const cleanName = name.trim().toLowerCase();
    return this.drugAliasMap.get(cleanName) || cleanName;
  }

  public getDrugData(name: string): DrugMapping | undefined {
    const genericName = this.normalizeDrugName(name);
    return this.drugDataMap.get(genericName);
  }

  public getPenyakitById(id: string): PenyakitEntry | undefined {
    return this.diseaseMap.get(id);
  }

  public getPenyakitByICD(code: string): PenyakitEntry | undefined {
    const cleanCode = code.toUpperCase().trim();
    return this.icdMap.get(cleanCode) || this.icdMap.get(cleanCode.split('.')[0]);
  }

  public getEpiWeight(icdCode: string): EpiWeightEntry | undefined {
    const cleanCode = icdCode.toUpperCase().trim();
    return this.epiWeights[cleanCode] || this.epiWeights[cleanCode.split('.')[0]];
  }

  /**
   * Normalizes text by applying synonym mapping (e.g., "puyeng" -> "pusing").
   */
  public normalizeText(text: string): string {
    let normalized = text.toLowerCase();
    for (const [synonym, replacement] of Object.entries(SYNONYM_MAP)) {
      // Use word boundary regex for precise replacement
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      normalized = normalized.replace(regex, replacement);
    }
    return normalized;
  }

  public isReady(): boolean {
    return this.initialized;
  }
}

export const dataProvider = CDSSDataProvider.getInstance();
