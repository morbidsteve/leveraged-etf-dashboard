/**
 * Static catalogue of common leveraged ETFs — sector + leverage + bias.
 * Used to warn the trader when their open positions have stacked exposure
 * (e.g. long SOXL + long TQQQ = both 3x risk-on bets, effectively 6x).
 *
 * Not exhaustive; covers the common scalping universe.
 */

export type EtfSector =
  | 'broad_market'
  | 'nasdaq100'
  | 'semiconductors'
  | 'biotech'
  | 'financials'
  | 'energy'
  | 'small_cap'
  | 'tech'
  | 'fang';

export type Bias = 'long' | 'short';

export interface EtfMeta {
  symbol: string;
  sector: EtfSector;
  leverage: number;     // 3 for 3x, -3 for 3x inverse, etc.
  bias: Bias;           // long = bullish, short = bearish (inverse)
  underlying: string;   // human label of the underlying index/sector
}

export const ETF_CATALOGUE: Record<string, EtfMeta> = {
  // S&P 500 / broad market
  UPRO: { symbol: 'UPRO', sector: 'broad_market', leverage: 3, bias: 'long', underlying: 'S&P 500' },
  SPXU: { symbol: 'SPXU', sector: 'broad_market', leverage: -3, bias: 'short', underlying: 'S&P 500' },
  SPXL: { symbol: 'SPXL', sector: 'broad_market', leverage: 3, bias: 'long', underlying: 'S&P 500' },
  SPXS: { symbol: 'SPXS', sector: 'broad_market', leverage: -3, bias: 'short', underlying: 'S&P 500' },
  SSO:  { symbol: 'SSO',  sector: 'broad_market', leverage: 2, bias: 'long', underlying: 'S&P 500' },

  // Nasdaq-100
  TQQQ: { symbol: 'TQQQ', sector: 'nasdaq100', leverage: 3, bias: 'long', underlying: 'Nasdaq-100' },
  SQQQ: { symbol: 'SQQQ', sector: 'nasdaq100', leverage: -3, bias: 'short', underlying: 'Nasdaq-100' },
  QLD:  { symbol: 'QLD',  sector: 'nasdaq100', leverage: 2, bias: 'long', underlying: 'Nasdaq-100' },

  // Semiconductors
  SOXL: { symbol: 'SOXL', sector: 'semiconductors', leverage: 3, bias: 'long', underlying: 'PHLX Semiconductor' },
  SOXS: { symbol: 'SOXS', sector: 'semiconductors', leverage: -3, bias: 'short', underlying: 'PHLX Semiconductor' },

  // Biotech
  LABU: { symbol: 'LABU', sector: 'biotech', leverage: 3, bias: 'long', underlying: 'S&P Biotechnology' },
  LABD: { symbol: 'LABD', sector: 'biotech', leverage: -3, bias: 'short', underlying: 'S&P Biotechnology' },

  // Financials
  FAS: { symbol: 'FAS', sector: 'financials', leverage: 3, bias: 'long', underlying: 'Russell 1000 Financial Services' },
  FAZ: { symbol: 'FAZ', sector: 'financials', leverage: -3, bias: 'short', underlying: 'Russell 1000 Financial Services' },

  // Tech
  TECL: { symbol: 'TECL', sector: 'tech', leverage: 3, bias: 'long', underlying: 'Technology Select Sector' },
  TECS: { symbol: 'TECS', sector: 'tech', leverage: -3, bias: 'short', underlying: 'Technology Select Sector' },

  // Small-cap
  TNA: { symbol: 'TNA', sector: 'small_cap', leverage: 3, bias: 'long', underlying: 'Russell 2000' },
  TZA: { symbol: 'TZA', sector: 'small_cap', leverage: -3, bias: 'short', underlying: 'Russell 2000' },
  URTY: { symbol: 'URTY', sector: 'small_cap', leverage: 3, bias: 'long', underlying: 'Russell 2000' },

  // FANG
  FNGU: { symbol: 'FNGU', sector: 'fang', leverage: 3, bias: 'long', underlying: 'NYSE FANG+' },
  FNGD: { symbol: 'FNGD', sector: 'fang', leverage: -3, bias: 'short', underlying: 'NYSE FANG+' },

  // Dow
  UDOW: { symbol: 'UDOW', sector: 'broad_market', leverage: 3, bias: 'long', underlying: 'Dow Jones' },
  SDOW: { symbol: 'SDOW', sector: 'broad_market', leverage: -3, bias: 'short', underlying: 'Dow Jones' },
  DDM:  { symbol: 'DDM',  sector: 'broad_market', leverage: 2, bias: 'long', underlying: 'Dow Jones' },

  // Energy / Defense / Retail / Real Estate / Utilities
  ERX: { symbol: 'ERX', sector: 'energy', leverage: 2, bias: 'long', underlying: 'Energy Select Sector' },
  ERY: { symbol: 'ERY', sector: 'energy', leverage: -2, bias: 'short', underlying: 'Energy Select Sector' },
  DFEN: { symbol: 'DFEN', sector: 'tech', leverage: 3, bias: 'long', underlying: 'Defense' },
  RETL: { symbol: 'RETL', sector: 'tech', leverage: 3, bias: 'long', underlying: 'Retail' },
  DPST: { symbol: 'DPST', sector: 'financials', leverage: 3, bias: 'long', underlying: 'Regional Banks' },
};

// Sectors that move together — used to detect "stacked risk-on" type setups.
const RISK_ON_SECTORS: EtfSector[] = [
  'broad_market', 'nasdaq100', 'semiconductors', 'tech', 'fang', 'small_cap',
];

export interface ExposureWarning {
  level: 'info' | 'warn' | 'severe';
  message: string;
}

export interface ExposureSummary {
  effectiveLeverage: number;     // sum of (leverage × notional / portfolio) — directional
  totalNotional: number;
  sectorBreakdown: Record<string, number>;   // ticker -> notional
  warnings: ExposureWarning[];
}

interface PositionLike {
  ticker: string;
  notional: number;     // shares × current price
}

/**
 * Compute exposure summary + warnings from a list of open positions.
 * Pure: caller supplies the list, we don't touch any store.
 */
export function evaluateExposure(positions: PositionLike[]): ExposureSummary {
  const sectorBreakdown: Record<string, number> = {};
  let totalNotional = 0;
  let signedNotional = 0;       // long positions are +, short positions are - (factoring inverse ETFs)

  for (const p of positions) {
    const meta = ETF_CATALOGUE[p.ticker.toUpperCase()];
    if (!meta) continue;
    sectorBreakdown[meta.sector] = (sectorBreakdown[meta.sector] ?? 0) + p.notional;
    totalNotional += p.notional;
    signedNotional += meta.bias === 'long' ? p.notional * meta.leverage : p.notional * meta.leverage; // leverage is signed
  }

  const effectiveLeverage = totalNotional > 0 ? signedNotional / totalNotional : 0;

  const warnings: ExposureWarning[] = [];

  // Stacked risk-on: multiple long-bias positions in correlated sectors
  const longSymbols = positions.filter((p) => {
    const m = ETF_CATALOGUE[p.ticker.toUpperCase()];
    return m && m.bias === 'long' && RISK_ON_SECTORS.includes(m.sector);
  });
  if (longSymbols.length >= 2) {
    warnings.push({
      level: 'warn',
      message: `${longSymbols.length} stacked risk-on long positions (${longSymbols.map((p) => p.ticker).join(', ')}). All move together — you're concentrating exposure.`,
    });
  }

  // Long + short on the same sector — these typically hedge but at decay cost
  const sectorBias: Record<string, Set<Bias>> = {};
  for (const p of positions) {
    const m = ETF_CATALOGUE[p.ticker.toUpperCase()];
    if (!m) continue;
    if (!sectorBias[m.sector]) sectorBias[m.sector] = new Set();
    sectorBias[m.sector].add(m.bias);
  }
  for (const [sector, biases] of Object.entries(sectorBias)) {
    if (biases.has('long') && biases.has('short')) {
      warnings.push({
        level: 'info',
        message: `Long + short positions in ${sector.replace(/_/g, ' ')} — hedged but you'll bleed on decay if it ranges.`,
      });
    }
  }

  // Effective leverage flag
  if (Math.abs(effectiveLeverage) >= 5) {
    warnings.push({
      level: 'severe',
      message: `Effective leverage ${effectiveLeverage.toFixed(1)}x. A 1% adverse move = ${Math.abs(effectiveLeverage).toFixed(1)}% account hit. Consider trimming.`,
    });
  } else if (Math.abs(effectiveLeverage) >= 3) {
    warnings.push({
      level: 'warn',
      message: `Effective leverage ${effectiveLeverage.toFixed(1)}x — a 1% market move = ${Math.abs(effectiveLeverage).toFixed(1)}% to your account.`,
    });
  }

  return {
    effectiveLeverage,
    totalNotional,
    sectorBreakdown,
    warnings,
  };
}
