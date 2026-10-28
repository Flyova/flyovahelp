// The local currency agents in a country trade in, for showing what a player pays or
// receives at an agent's rate. Countries not listed show "local currency".
const COUNTRY_CURRENCY = {
  Nigeria: "NGN", Ghana: "GHS", Kenya: "KES", "South Africa": "ZAR", Uganda: "UGX", Tanzania: "TZS",
  Rwanda: "RWF", Zambia: "ZMW", Malawi: "MWK", Cameroon: "XAF", Benin: "XOF", Togo: "XOF", Senegal: "XOF",
  "Cote d'Ivoire": "XOF", "Ivory Coast": "XOF", Mali: "XOF", "Burkina Faso": "XOF", Niger: "XOF", Ethiopia: "ETB",
  Egypt: "EGP", Morocco: "MAD", Botswana: "BWP", Namibia: "NAD", Zimbabwe: "USD", Liberia: "LRD", "Sierra Leone": "SLE",
  Gambia: "GMD", "United Kingdom": "GBP", "United States": "USD", Canada: "CAD", India: "INR", Pakistan: "PKR",
  Bangladesh: "BDT", Philippines: "PHP", Indonesia: "IDR", Malaysia: "MYR", Brazil: "BRL", Mexico: "MXN",
};

export const currencyOf = (country) => COUNTRY_CURRENCY[String(country || "").trim()] || null;

/** "₦75,000.00" for a known country's currency, otherwise "75,000.00 (local currency)". */
export function formatLocal(amount, country) {
  const n = Number(amount) || 0;
  const code = currencyOf(country);
  if (code) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(n);
    } catch {
      // Unknown to this browser: fall through.
    }
  }
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} (local currency)`;
}
