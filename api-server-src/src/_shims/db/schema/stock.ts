import { pgTable, text, integer, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable);
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;

export const recipientsTable = pgTable("recipients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
});

export const insertRecipientSchema = createInsertSchema(recipientsTable).omit({ id: true });
export type InsertRecipient = z.infer<typeof insertRecipientSchema>;
export type Recipient = typeof recipientsTable.$inferSelect;

export const markersTable = pgTable("markers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  text: text("text").notNull().default(""),
  price: real("price"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMarkerSchema = createInsertSchema(markersTable).omit({ id: true, createdAt: true });
export type InsertMarker = z.infer<typeof insertMarkerSchema>;
export type Marker = typeof markersTable.$inferSelect;

export const positionHistoryTable = pgTable("position_history", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  ratio: integer("ratio").notNull(),
  source: text("source").notNull().default("calc"),
});

export const insertPositionHistorySchema = createInsertSchema(positionHistoryTable).omit({ id: true });
export type InsertPositionHistory = z.infer<typeof insertPositionHistorySchema>;
export type PositionHistory = typeof positionHistoryTable.$inferSelect;

// LINE bot push subscribers. userId is the LINE Messaging API userId (U-prefixed).
// One row per subscriber; auto-managed via follow/unfollow events + subscribe command.
export const lineSubscribersTable = pgTable("line_subscribers", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
  // mute: temporary opt-out without losing the row (e.g. user is on vacation).
  muted: integer("muted").notNull().default(0),
});

export const insertLineSubscriberSchema = createInsertSchema(lineSubscribersTable).omit({
  subscribedAt: true,
});
export type InsertLineSubscriber = z.infer<typeof insertLineSubscriberSchema>;
export type LineSubscriber = typeof lineSubscribersTable.$inferSelect;
