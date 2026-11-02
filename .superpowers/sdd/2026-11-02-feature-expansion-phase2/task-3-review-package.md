### Review Package — Phase2 T3
BASE: 3982f2d0
HEAD: 3b14673beeba63bb62ac37b9f96f06d6ff8ec9f7
---
3b14673b feat: add quadPoints support to updateHighlight
---
 packages/core/src/db/highlight-queries.ts | 8 ++++++++
 1 file changed, 8 insertions(+)
---
diff --git a/packages/core/src/db/highlight-queries.ts b/packages/core/src/db/highlight-queries.ts
index 3e49012c..b339f19f 100644
--- a/packages/core/src/db/highlight-queries.ts
+++ b/packages/core/src/db/highlight-queries.ts
@@ -191,20 +191,28 @@ export async function updateHighlight(id: string, updates: Partial<Highlight>):
     values.push(updates.color);
   }
   if (Object.prototype.hasOwnProperty.call(updates, "note")) {
     sets.push("note = ?");
     values.push(updates.note ?? null);
   }
   if (updates.text !== undefined) {
     sets.push("text = ?");
     values.push(updates.text);
   }
+  if (Object.prototype.hasOwnProperty.call(updates, "quadPoints")) {
+    sets.push("quad_points = ?");
+    values.push(
+      updates.quadPoints && updates.quadPoints.length > 0
+        ? JSON.stringify(updates.quadPoints)
+        : null,
+    );
+  }
   // Add sync tracking
   const deviceId = await getDeviceId();
   const syncVersion = await nextSyncVersion(database, "highlights");
   const updatedAt = await nextUpdatedAt(database, "highlights", id);
   sets.push("updated_at = ?");
   values.push(updatedAt);
   sets.push("sync_version = ?");
   values.push(syncVersion);
   sets.push("last_modified_by = ?");
   values.push(deviceId);
