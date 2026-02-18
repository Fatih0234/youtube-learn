-- Add flashcards table for video-anchored spaced repetition learning
CREATE TABLE flashcards (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,
  selected_text text NOT NULL,
  t_start integer NOT NULL, -- timestamp in seconds where selection begins
  due_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  interval_days integer NOT NULL DEFAULT 0,
  ease float NOT NULL DEFAULT 2.5,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own flashcards"
  ON flashcards FOR ALL USING (auth.uid() = user_id);

CREATE INDEX flashcards_user_id_idx ON flashcards(user_id);
CREATE INDEX flashcards_due_at_idx ON flashcards(user_id, due_at);
