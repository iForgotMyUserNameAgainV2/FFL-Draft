/**
 * Plain-English definitions for every metric in the app, surfaced as
 * hover tooltips. Keep these jargon-free — they are the explanation a
 * league-mate would actually want.
 */

export const GLOSSARY = {
  mdi: "Market Disparity Index — how mispriced a player is. Positive means our model thinks they're worth MORE than the market is charging (buy them); negative means the market is overpaying (sell them). Measured in standard deviations, so +1.0 is a big edge.",
  ppg: "Points per game — the player's average fantasy score in weeks they actually played, from real league scoring.",
  par: "Points Above Replacement — how many points per game this player scores beyond a freely-available waiver player at the same position. 0 means easily replaceable; +5 or more is a difference-maker.",
  marketValue:
    "What the player actually trades for right now — a consensus of real dynasty trades from FantasyCalc and Dynasty Dealer. Higher = more expensive to acquire.",
  engineValue:
    "What our model says the player SHOULD be worth, based on production, age curve, contract security, and draft pedigree — independent of market hype.",
  signal:
    "The trading verdict: BUY = market undervalues them (acquire), SELL = market overpays (move them), HOLD = fairly priced.",
  maxPf:
    "Maximum Possible Points — what your team would have scored with a perfect lineup every week. The gap between this and your actual points is what bad start/sit decisions cost you.",
  efficiency:
    "Actual points ÷ maximum possible points. 100% means you started the right players every week; below ~92% you're leaving real wins on the bench.",
  contendScore:
    "Where your team sits on the tank-to-contend spectrum (0 to 1), combining roster value rank, how win-now your assets are, and your record.",
  window:
    "Your competitive timeline. REBUILD = trade vets for youth and picks. RETOOL = consolidate depth into stars. CONTEND = add proven starters. ALL-IN = championship now, spend future picks.",
  winNow:
    "The share of your roster's value that produces THIS season (veterans in their prime), versus value that pays off in future seasons (young players and picks). Based on each player's remaining career expectancy.",
  assetPercentile:
    "How your total roster + pick value ranks against the rest of the league. 100% = richest roster in the league.",
  synergy:
    "How naturally two teams fit as trade partners (0 to 1): one team's surplus covers the other's weakness, and their timelines don't compete — a rebuilder and a contender can both win the same deal.",
  winWin:
    "The odds both managers come out ahead by their own goals — and would actually say yes. Based on how much each side's roster improves at the positions they need, for the timeline they're on.",
  phase:
    "Where we are in the dynasty calendar. Pick values swing with it: they're cheapest mid-season (win-now managers pay up for players) and most expensive around the rookie draft.",
  pickMultiplier:
    "The seasonal price adjustment on rookie picks right now. Below 1.0 = picks are on discount (good time to acquire them); above 1.0 = picks are trading rich (good time to sell them).",
  positionalBalance:
    "How many startable players you have at a position versus what the league format demands. Positive = tradeable surplus; negative = a hole to fill.",
  trend:
    "How the player's market price has moved in the last 30 days. Rising prices often keep rising short-term — buy dips on players you believe in, sell spikes on players you don't.",
  totalValue:
    "The combined market value of every player and draft pick this team owns — the size of the whole portfolio.",
  record: "Regular-season wins and losses this season.",
  lineup:
    "Whether the player is currently in this team's starting lineup or on the bench, straight from Sleeper.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
