import { dataProvider } from './data-provider';
import type { MatchedCandidate } from './symptom-matcher';

const EPI_WEIGHT_CAP = 1.50; // Increased from 1.15 to allow 50% boost for high prevalence

export async function applyEpidemiologyWeights(
  candidates: MatchedCandidate[],
  patientGender?: 'L' | 'P',
): Promise<MatchedCandidate[]> {
  if (!dataProvider.isReady()) await dataProvider.initialize();

  const weighted = candidates.map(c => {
    const entry = dataProvider.getEpiWeight(c.icd10);
    if (!entry) return c;

    // AADI V4.3 Logic: Combine base weight with aggressive prevalence scaling
    const prevalenceFactor = 1 + (entry.prevalence_pct / 100) * 1.5; 
    const baseWeight = Math.min(entry.weight * prevalenceFactor, EPI_WEIGHT_CAP);
    let genderAdjusted = baseWeight;

    if (patientGender && entry.cases_per_month >= 20) {
      if (patientGender === 'P' && entry.female_pct > 60) genderAdjusted = Math.min(baseWeight + 0.05, EPI_WEIGHT_CAP);
      else if (patientGender === 'L' && entry.male_pct > 60) genderAdjusted = Math.min(baseWeight + 0.05, EPI_WEIGHT_CAP);
    }

    return { ...c, matchScore: Math.min(1, c.rawMatchScore * genderAdjusted) };
  });

  weighted.sort((a, b) => b.matchScore - a.matchScore);
  return weighted;
}

export async function getEpidemiologyMeta() {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  // We can add meta to dataProvider if needed, but for now we'll just return a simplified meta
  return { source: 'dataProvider', generated: new Date().toISOString() };
}

export async function getLocalEpidemiologyContext(topN = 15): Promise<string> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  
  const diseases = dataProvider.getDiseases();
  const entries = diseases
    .map(d => ({ code: d.icd10, weight: dataProvider.getEpiWeight(d.icd10) }))
    .filter(e => e.weight && e.weight.total_annual > 50)
    .sort((a, b) => (b.weight?.total_annual ?? 0) - (a.weight?.total_annual ?? 0))
    .slice(0, topN);

  if (entries.length === 0) return '';
  const lines = entries.map(e =>
    `- ${e.code} ${e.weight!.nama}: ${e.weight!.prevalence_pct.toFixed(1)}% (${e.weight!.total_annual} kasus/tahun, M:${e.weight!.male_pct}% F:${e.weight!.female_pct}%)`
  );
  return `EPIDEMIOLOGI LOKAL (Puskesmas Balowerti, Kediri — data 14 bulan):\n${lines.join('\n')}`;
}
