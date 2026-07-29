import { Router } from "express";
import { db, leaderboardTable, insertLeaderboardSchema } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const entries = await db
      .select()
      .from(leaderboardTable)
      .orderBy(desc(leaderboardTable.score))
      .limit(10);
    res.json(entries);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch leaderboard");
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.post("/", async (req, res) => {
  const parsed = insertLeaderboardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { submissionId, playerName, score, stageReached } = parsed.data;
  const trimmed = playerName.trim().slice(0, 12);
  if (!trimmed) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  try {
    const [entry] = await db
      .insert(leaderboardTable)
      .values({ submissionId, playerName: trimmed, score, stageReached })
      .onConflictDoNothing({ target: leaderboardTable.submissionId })
      .returning();
    if (entry) {
      res.status(201).json(entry);
      return;
    }

    const [existingEntry] = await db
      .select()
      .from(leaderboardTable)
      .where(eq(leaderboardTable.submissionId, submissionId))
      .limit(1);
    if (!existingEntry) {
      throw new Error("Idempotent leaderboard submission was not found after conflict");
    }
    res.status(200).json(existingEntry);
  } catch (err) {
    req.log.error({ err }, "Failed to submit score");
    res.status(500).json({ error: "Failed to submit score" });
  }
});

export default router;
