-- CreateTable
CREATE TABLE "movies" (
    "movie_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "release_year" TEXT,
    "poster_url" VARCHAR(255),
    "rating" VARCHAR(255),
    "genres" TEXT[],
    "tmdb_id" INTEGER,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("movie_id")
);

-- CreateTable
CREATE TABLE "user_saved_movies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "movie_id" UUID NOT NULL,
    "saved_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tmdb_id" INTEGER,

    CONSTRAINT "user_saved_movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" VARCHAR(255),
    "email" VARCHAR(255),
    "password" VARCHAR(255),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "rejected_movies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tmdb_id" INTEGER,
    "title" VARCHAR(255),

    CONSTRAINT "rejected_movies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_saved_movies" ADD CONSTRAINT "user_saved_movies_relation_2" FOREIGN KEY ("movie_id") REFERENCES "movies"("movie_id") ON DELETE SET NULL ON UPDATE SET DEFAULT;

-- AddForeignKey
ALTER TABLE "user_saved_movies" ADD CONSTRAINT "user_saved_movies_relation_3" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE SET DEFAULT;
