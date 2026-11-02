### Review Package — Phase2 T1
BASE: 7b29b553
HEAD: a7707d3d
---
a7707d3d feat: add quad_points column to highlights table for PDF positioning
---
 packages/core/src/db/db-core.ts           |  7 +++++++
 packages/core/src/db/highlight-queries.ts | 14 ++++++++++++--
 packages/core/src/db/migrations.ts        |  5 +++++
 packages/core/src/types/annotation.ts     |  2 ++
 4 files changed, 26 insertions(+), 2 deletions(-)
---
diff --git a/packages/core/src/db/db-core.ts b/packages/core/src/db/db-core.ts
index b3cbb221..5fce0891 100644
--- a/packages/core/src/db/db-core.ts
+++ b/packages/core/src/db/db-core.ts
@@ -695,20 +695,27 @@ export async function initDatabase(): Promise<void> {
         // Column already exists or table doesn't exist yet
       }
       try {
         await database.execute(
           "CREATE INDEX IF NOT EXISTS idx_books_deleted_at ON books(deleted_at)",
         );
       } catch {
         // Older installs may fail to add the column on the first pass; don't block startup.
       }
 
+      // Migration 14: Add quad_points column for PDF highlight positioning
+      try {
+        await database.execute("ALTER TABLE highlights ADD COLUMN quad_points TEXT");
+      } catch {
+        // Column already exists
+      }
+
       // Migration: Create feedback table
       await database.execute(`
     CREATE TABLE IF NOT EXISTS feedback (
       id TEXT PRIMARY KEY,
       issue_number INTEGER NOT NULL,
       issue_url TEXT NOT NULL,
       title TEXT NOT NULL,
       type TEXT NOT NULL DEFAULT 'other',
       status TEXT NOT NULL DEFAULT 'open',
       created_at INTEGER NOT NULL,
diff --git a/packages/core/src/db/highlight-queries.ts b/packages/core/src/db/highlight-queries.ts
index a686bbfd..3e49012c 100644
--- a/packages/core/src/db/highlight-queries.ts
+++ b/packages/core/src/db/highlight-queries.ts
@@ -14,97 +14,103 @@ export async function getHighlights(bookId: string): Promise<Highlight[]> {
   const rows = await database.select<{
     id: string;
     book_id: string;
     cfi: string;
     text: string;
     color: string;
     note: string | null;
     chapter_title: string | null;
     created_at: number;
     updated_at: number;
+    quad_points: string | null;
   }>("SELECT * FROM highlights WHERE book_id = ? ORDER BY created_at DESC", [bookId]);
   return sortAnnotationsByPosition(
     rows.map((r) => ({
       id: r.id,
       bookId: r.book_id,
       cfi: r.cfi,
       text: r.text,
       color: r.color as Highlight["color"],
       note: r.note || undefined,
       chapterTitle: r.chapter_title || undefined,
+      quadPoints: r.quad_points ? JSON.parse(r.quad_points) : undefined,
       createdAt: r.created_at,
       updatedAt: r.updated_at,
     })),
   );
 }
 
 /** Get all highlights across all books (for general chat without bookId) */
 export async function getAllHighlights(limit = 50): Promise<Highlight[]> {
   const database = await getDB();
   const rows = await database.select<{
     id: string;
     book_id: string;
     cfi: string;
     text: string;
     color: string;
     note: string | null;
     chapter_title: string | null;
     created_at: number;
     updated_at: number;
+    quad_points: string | null;
   }>("SELECT * FROM highlights ORDER BY created_at DESC LIMIT ?", [limit]);
   return rows.map((r) => ({
     id: r.id,
     bookId: r.book_id,
     cfi: r.cfi,
     text: r.text,
     color: r.color as Highlight["color"],
     note: r.note || undefined,
     chapterTitle: r.chapter_title || undefined,
+    quadPoints: r.quad_points ? JSON.parse(r.quad_points) : undefined,
     createdAt: r.created_at,
     updatedAt: r.updated_at,
   }));
 }
 
 /** Get all highlights with book info (JOIN query) */
 export async function getAllHighlightsWithBooks(limit = 500): Promise<HighlightWithBook[]> {
   const database = await getDB();
   const rows = await database.select<{
     id: string;
     book_id: string;
     cfi: string;
     text: string;
     color: string;
     note: string | null;
     chapter_title: string | null;
     created_at: number;
     updated_at: number;
+    quad_points: string | null;
     book_title: string;
     book_author: string;
     book_cover_url: string | null;
   }>(
     `SELECT 
-      h.id, h.book_id, h.cfi, h.text, h.color, h.note, h.chapter_title, h.created_at, h.updated_at,
+      h.id, h.book_id, h.cfi, h.text, h.color, h.note, h.chapter_title, h.created_at, h.updated_at, h.quad_points,
       b.title as book_title, b.author as book_author, b.cover_url as book_cover_url
     FROM highlights h
     LEFT JOIN books b ON h.book_id = b.id
     ORDER BY h.created_at DESC
     LIMIT ?`,
     [limit],
   );
   return rows.map((r) => ({
     id: r.id,
     bookId: r.book_id,
     cfi: r.cfi,
     text: r.text,
     color: r.color as Highlight["color"],
     note: r.note || undefined,
     chapterTitle: r.chapter_title || undefined,
+    quadPoints: r.quad_points ? JSON.parse(r.quad_points) : undefined,
     createdAt: r.created_at,
     updatedAt: r.updated_at,
     bookTitle: r.book_title || "",
     bookAuthor: r.book_author || "",
     bookCoverUrl: r.book_cover_url || undefined,
   }));
 }
 
 /** Get highlight statistics */
 export async function getHighlightStats(): Promise<{
@@ -146,30 +152,34 @@ export async function getHighlightStats(): Promise<{
     totalBooks: booksRows[0]?.count || 0,
     colorDistribution,
     recentCount: recentRows[0]?.count || 0,
   };
 }
 
 export async function insertHighlight(highlight: Highlight): Promise<void> {
   const database = await getDB();
   const deviceId = await getDeviceId();
   const syncVersion = await nextSyncVersion(database, "highlights");
+  const quadPointsJson = highlight.quadPoints && highlight.quadPoints.length > 0
+    ? JSON.stringify(highlight.quadPoints)
+    : null;
   await database.execute(
-    "INSERT INTO highlights (id, book_id, cfi, text, color, note, chapter_title, created_at, updated_at, sync_version, last_modified_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
+    "INSERT INTO highlights (id, book_id, cfi, text, color, note, chapter_title, quad_points, created_at, updated_at, sync_version, last_modified_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
     [
       highlight.id,
       highlight.bookId,
       highlight.cfi,
       highlight.text,
       highlight.color,
       highlight.note || null,
       highlight.chapterTitle || null,
+      quadPointsJson,
       highlight.createdAt,
       highlight.updatedAt,
       syncVersion,
       deviceId,
     ],
   );
 }
 
 export async function updateHighlight(id: string, updates: Partial<Highlight>): Promise<void> {
   const database = await getDB();
diff --git a/packages/core/src/db/migrations.ts b/packages/core/src/db/migrations.ts
index d6eac4c7..467e3db2 100644
--- a/packages/core/src/db/migrations.ts
+++ b/packages/core/src/db/migrations.ts
@@ -114,20 +114,25 @@ const migrations: Migration[] = [
   },
   {
     version: 13,
     description: "Add rolling memory summary to chat threads",
     up: [
       "ALTER TABLE threads ADD COLUMN memory_summary TEXT",
       "ALTER TABLE threads ADD COLUMN memory_updated_at INTEGER",
       "ALTER TABLE threads ADD COLUMN memory_message_count INTEGER DEFAULT 0",
     ],
   },
+  {
+    version: 14,
+    description: "Add quad_points column to highlights for PDF highlight positioning",
+    up: "ALTER TABLE highlights ADD COLUMN quad_points TEXT",
+  },
 ];
 
 /** Run pending migrations */
 export async function runMigrations(): Promise<void> {
   const platform = getPlatformService();
   const db: IDatabase = await platform.loadDatabase(
     `sqlite:${await getDatabaseFilePath("readany.db")}`,
   );
 
   // Create migrations table if not exists
diff --git a/packages/core/src/types/annotation.ts b/packages/core/src/types/annotation.ts
index f623e33a..a737f6bc 100644
--- a/packages/core/src/types/annotation.ts
+++ b/packages/core/src/types/annotation.ts
@@ -14,20 +14,22 @@ export const HIGHLIGHT_COLOR_HEX: Record<HighlightColor, string> = {
   violet: "#a78bfa", // violet-400
 };
 
 // All available highlight colors in display order
 export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink", "purple"];
 
 export interface Highlight {
   id: string;
   bookId: string;
   cfi: string; // EPUB CFI range
+  /** PDF highlight bounding rect in page coordinate space. Flat array [x1,y1,x2,y2,x3,y3,x4,y4]. null/undefined for EPUB. */
+  quadPoints?: number[];
   text: string;
   color: HighlightColor;
   note?: string;
   chapterTitle?: string;
   createdAt: number;
   updatedAt: number;
 }
 
 export interface Note {
   id: string;
