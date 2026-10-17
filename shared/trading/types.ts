// Tipos de trading do Bullroom: o que cada robô (agente) e a carteira levam no snapshot.
// Código puro: sem APIs de Node nem de DOM.

export type BotPosition = 'long' | 'short' | 'flat';

/** Estado de trading de um robô. Vai em AgentInfo.trading. */
export interface BotTrading {
  /** Nome da corretora (ex.: "Binance"). */
  exchange: string;
  /** Par negociado (ex.: "BTC/USDT"); é também o nome da sala. */
  pair: string;
  /** Nome da estratégia (ex.: "Spread"). */
  strategy: string;
  position: BotPosition;
  /** PL do dia em dólares. */
  pnlUsd: number;
  /** Perda diária máxima (positivo): ao chegar a -limite, o robô é ejetado. */
  dailyLossLimitUsd: number;
  /** Epoch ms da ejeção. Presente = ejetado (não volta a operar no dia). */
  ejectedAt?: number;
}

/** Resumo da carteira. Vai em OfficeSnapshot.portfolio. */
export interface PortfolioInfo {
  /** true = dados do simulador (a interface mostra o selo SIMULATED). */
  simulated: boolean;
  totalPnlUsd: number;
  /** Robôs presentes no snapshot. */
  bots: number;
  /** Robôs posicionados agora. */
  trading: number;
  /** Robôs ejetados hoje. */
  ejected: number;
  /** PL total ao longo do tempo, do mais antigo para o mais recente. */
  series: Array<{ at: number; pnlUsd: number }>;
}

export type PnlTone = 'gain' | 'loss' | 'zero';
