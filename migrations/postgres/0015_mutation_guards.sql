CREATE TABLE mutation_guards (id TEXT PRIMARY KEY NOT NULL, allowed INTEGER NOT NULL CHECK (allowed = 1));
