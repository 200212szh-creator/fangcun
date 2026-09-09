import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookEditions = sqliteTable("book_editions", {
  id: text("id").primaryKey(),
  workId: text("work_id"),
  title: text("title").notNull(),
  authors: text("authors").notNull(),
  translators: text("translators"),
  publisher: text("publisher"),
  publicationYear: integer("publication_year"),
  edition: text("edition"),
  originalTitle: text("original_title"),
  seriesName: text("series_name"),
  editionStatement: text("edition_statement"),
  editionNumber: integer("edition_number"),
  printRun: integer("print_run"),
  publicationDate: text("publication_date"),
  editionNotes: text("edition_notes"),
  originalPublisher: text("original_publisher"),
  format: text("format"),
  language: text("language"),
  isbn10: text("isbn10"),
  isbn13: text("isbn13"),
  pages: integer("pages"),
  description: text("description"),
  coverUrl: text("cover_url"),
  subjects: text("subjects"),
  source: text("source").notNull(),
  externalId: text("external_id"),
  userOverride: text("user_override").notNull().default("{}"),
});

export const works = sqliteTable("works", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const ownedCopies = sqliteTable("owned_copies", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  editionId: text("edition_id").notNull(),
  location: text("location"),
  categoryId: text("category_id"),
  readingStatus: text("reading_status").notNull().default("unread"),
  rating: integer("rating"),
  notes: text("notes"),
  acquiredAt: text("acquired_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  acquisitionMethod: text("acquisition_method"),
  acquisitionSource: text("acquisition_source"),
  acquisitionPlace: text("acquisition_place"),
  priceCents: integer("price_cents"),
  currency: text("currency"),
  condition: text("condition"),
  inscription: text("inscription"),
  receiptNote: text("receipt_note"),
  shelfLocationId: text("shelf_location_id"),
  shelfSlot: text("shelf_slot"),
  shelfCoordinate: text("shelf_coordinate"),
  locationSortOrder: integer("location_sort_order"),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description"), color: text("color"), userId: text("user_id").notNull(),
});
export const tags = sqliteTable("tags", { id: text("id").primaryKey(), name: text("name").notNull(), color: text("color"), userId: text("user_id").notNull() });
export const copyTags = sqliteTable("copy_tags", { copyId: text("copy_id").notNull(), tagId: text("tag_id").notNull() });
export const shelfLocations = sqliteTable("shelf_locations", { id: text("id").primaryKey(), name: text("name").notNull(), parentId: text("parent_id"), room: text("room"), userId: text("user_id").notNull(), sortOrder: integer("sort_order").notNull().default(0), active: integer("active", { mode: "boolean" }).notNull().default(true), locationType: text("location_type"), displayCode: text("display_code") });
export const wishlistItems = sqliteTable("wishlist_items", { id: text("id").primaryKey(), editionId: text("edition_id").notNull(), note: text("note"), userId: text("user_id").notNull(), createdAt: text("created_at").notNull() });
export const researchWorks = sqliteTable("research_works", { id: text("id").primaryKey(), title: text("title").notNull(), authors: text("authors").notNull(), abstract: text("abstract"), doi: text("doi"), journal: text("journal"), year: integer("year"), tags: text("tags").notNull().default("[]"), notes: text("notes"), openAccessUrl: text("open_access_url"), source: text("source"), userId: text("user_id").notNull(), createdAt: text("created_at").notNull() });
export const researchFolders = sqliteTable("research_folders", { id: text("id").primaryKey(), name: text("name").notNull(), description: text("description"), userId: text("user_id").notNull(), createdAt: text("created_at").notNull() });
export const folderWorks = sqliteTable("folder_works", { folderId: text("folder_id").notNull(), workId: text("work_id").notNull() });
export const externalReferences = sqliteTable("external_references", { id: text("id").primaryKey(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), source: text("source").notNull(), sourceId: text("source_id"), url: text("url"), userId: text("user_id").notNull() });
export const searchCache = sqliteTable("search_cache", { cacheKey: text("cache_key").primaryKey(), kind: text("kind").notNull(), payload: text("payload").notNull(), expiresAt: integer("expires_at").notNull() });
export const loans = sqliteTable("loans", { id: text("id").primaryKey(), copyId: text("copy_id").notNull(), borrowerName: text("borrower_name").notNull(), borrowerContact: text("borrower_contact"), lentAt: text("lent_at").notNull(), dueAt: text("due_at"), returnedAt: text("returned_at"), status: text("status").notNull().default("active"), note: text("note"), originalLocationId: text("original_location_id"), originalLocationSlot: text("original_location_slot"), originalLocationCoordinate: text("original_location_coordinate"), originalLocationText: text("original_location_text"), originalLocationSortOrder: integer("original_location_sort_order"), originalLocationCaptured: integer("original_location_captured").notNull().default(0) });
export const concepts = sqliteTable("concepts", { id: text("id").primaryKey(), name: text("name").notNull(), description: text("description"), userId: text("user_id").notNull() });
export const annotations = sqliteTable("annotations", { id: text("id").primaryKey(), copyId: text("copy_id").notNull(), pageLabel: text("page_label"), body: text("body").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
export const annotationConcepts = sqliteTable("annotation_concepts", { annotationId: text("annotation_id").notNull(), conceptId: text("concept_id").notNull() });
