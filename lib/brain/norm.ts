// One way of writing a name down, so the same record found two ways is the same record.
// It lives alone because the store's lookups are heavy and everything that only needs a
// normalised name should not have to carry them.
export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\b(feat|featuring|ft)\b.*$/, "").replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
