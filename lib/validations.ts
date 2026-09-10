import { z } from "zod";

export const contributorInputSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().min(1).max(240),
  sortName: z.string().trim().max(240).optional(),
  normalizedName: z.string().trim().max(240).optional(),
  role: z.enum(["author", "translator", "editor", "compiler", "illustrator", "other"]),
  orderIndex: z.number().int().min(0).max(100000).optional(),
  creditedAs: z.string().trim().max(240).optional(),
});

export const bookInputSchema = z.object({
  title: z.string().trim().min(1),
  authors: z.string().trim().default(""),
  translators: z.string().trim().optional(),
  contributors: z.array(contributorInputSchema).max(80).optional(),
  publisher: z.string().optional(),
  publicationYear: z.coerce.number().int().min(0).max(3000).optional().or(z.literal("")),
  publicationDate: z.string().trim().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/, "Use YYYY, YYYY-MM, or YYYY-MM-DD").optional().or(z.literal("")),
  isbn13: z.string().optional(),
  isbn10: z.string().optional(),
  language: z.string().optional(),
  format: z.string().optional(),
  pages: z.coerce.number().int().positive().optional().or(z.literal("")),
  originalTitle: z.string().trim().max(240).optional(),
  seriesName: z.string().trim().max(240).optional(),
  editionStatement: z.string().trim().max(240).optional(),
  editionNumber: z.coerce.number().int().positive().optional().or(z.literal("")),
  printRun: z.coerce.number().int().positive().optional().or(z.literal("")),
  editionNotes: z.string().trim().max(4000).optional(),
  originalPublisher: z.string().trim().max(240).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  shelfLocationId: z.string().optional(),
  shelfSlot: z.string().trim().max(120).optional(),
  shelfCoordinate: z.string().trim().max(120).optional(),
  locationSortOrder: z.coerce.number().int().min(0).max(100000).optional().or(z.literal("")),
  categoryId: z.string().optional(),
  readingStatus: z.enum(["unread", "reading", "read", "paused", "dropped"]).default("unread"),
  notes: z.string().optional(),
  acquiredAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal("")),
  acquisitionMethod: z.preprocess((value) => value === "" ? undefined : value, z.enum(["purchase", "gift", "inherited", "other"]).optional()),
  acquisitionSource: z.string().trim().max(240).optional(),
  acquisitionPlace: z.string().trim().max(240).optional(),
  priceCents: z.coerce.number().int().min(0).max(1000000000).optional().or(z.literal("")),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code").optional().or(z.literal("")),
  condition: z.string().trim().max(120).optional(),
  inscription: z.string().trim().max(1000).optional(),
  receiptNote: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  if (!value.authors && !value.contributors?.some((item) => item.role === "author")) {
    context.addIssue({ code: "custom", path: ["authors"], message: "Provide legacy authors or at least one author contributor" });
  }
});

export const paperInputSchema = z.object({
  title: z.string().trim().min(1),
  authors: z.array(z.string()).default([]),
  abstract: z.string().optional(),
  doi: z.string().optional(),
  journal: z.string().optional(),
  year: z.number().int().optional(),
  notes: z.string().optional(),
  openAccessUrl: z.string().url().optional().or(z.literal("")),
});

export const editionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  authors: z.array(z.string().trim().min(1)).max(40).optional(),
  translators: z.array(z.string().trim().min(1)).max(40).optional(),
  contributors: z.array(contributorInputSchema).max(80).optional(),
  publisher: z.string().trim().max(240).nullable().optional(),
  publicationYear: z.number().int().min(0).max(3000).nullable().optional(),
  publicationDate: z.string().trim().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/).nullable().optional(),
  edition: z.string().trim().max(240).nullable().optional(),
  originalTitle: z.string().trim().max(240).nullable().optional(),
  seriesName: z.string().trim().max(240).nullable().optional(),
  editionStatement: z.string().trim().max(240).nullable().optional(),
  editionNumber: z.number().int().positive().nullable().optional(),
  printRun: z.number().int().positive().nullable().optional(),
  editionNotes: z.string().trim().max(4000).nullable().optional(),
  originalPublisher: z.string().trim().max(240).nullable().optional(),
  format: z.string().trim().max(120).nullable().optional(),
  language: z.string().trim().max(80).nullable().optional(),
  isbn10: z.string().trim().max(20).nullable().optional(),
  isbn13: z.string().trim().max(20).nullable().optional(),
  pages: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  subjects: z.array(z.string().trim().min(1)).max(100).optional(),
  source: z.string().trim().max(80).optional(),
  externalId: z.string().trim().max(240).nullable().optional(),
});

export const copyUpdateSchema = z.object({
  location: z.string().trim().max(240).nullable().optional(),
  shelfLocationId: z.string().trim().max(100).nullable().optional(),
  shelfSlot: z.string().trim().max(120).nullable().optional(),
  shelfCoordinate: z.string().trim().max(120).nullable().optional(),
  locationSortOrder: z.number().int().min(0).max(100000).nullable().optional(),
  categoryId: z.string().trim().max(100).nullable().optional(),
  readingStatus: z.enum(["unread", "reading", "read", "paused", "dropped"]).optional(),
  rating: z.number().int().min(0).max(5).nullable().optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  acquiredAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  acquisitionMethod: z.enum(["purchase", "gift", "inherited", "other"]).nullable().optional(),
  acquisitionSource: z.string().trim().max(240).nullable().optional(),
  acquisitionPlace: z.string().trim().max(240).nullable().optional(),
  priceCents: z.number().int().min(0).max(1000000000).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).nullable().optional(),
  condition: z.string().trim().max(120).nullable().optional(),
  inscription: z.string().trim().max(1000).nullable().optional(),
  receiptNote: z.string().trim().max(2000).nullable().optional(),
});

export const loanInputSchema = z.object({ borrowerName: z.string().trim().min(1).max(160), borrowerContact: z.string().trim().max(240).optional(), dueAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), note: z.string().trim().max(2000).optional() });
export const annotationInputSchema = z.object({ pageLabel: z.string().trim().max(120).optional(), body: z.string().trim().min(1).max(20000), concepts: z.array(z.string().trim().max(80)).max(30).default([]) });
export const annotationUpdateSchema = annotationInputSchema.partial();
