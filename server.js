// server.js

const express = require("express");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const cors = require('cors');
const { randomUUID } = require("crypto");
var dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;

console.log(connectionString);

const adapter = new PrismaPg({ connectionString: connectionString });
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 4000;

const axios = require("axios");

//AI Model
const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({});

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY, 
  baseURL: "https://api.groq.com/openai/v1",
});


// const { authenticateToken } = require('./middleware/auth'); // Ensure this path is correct

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors());

///////////////////////////////////////////////////////////////////////////////
const authenticateToken = (req, res, next) => {
  // Get the token from the Authorization header
  const authHeader = req.headers["authorization"];
  // Format is usually 'Bearer TOKEN', so split and take the second part
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    // 401: Unauthorized (no token)
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // 403: Forbidden (token is invalid or expired)
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    // Token is valid, attach the user payload to the request
    req.user = user;
    next(); // Move on to the route handler
  });
};

async function generateUniqueMovieId() {
  let isUnique = false;
  let newId = "";

  while (!isUnique) {
    newId = randomUUID();
    console.log(newId);

    // Check if this ID already exists in the table
    const existing = await prisma.movies.findUnique({
      where: { movie_id: newId },
    });

    if (!existing) {
      isUnique = true;
    }
  }

  return newId;
}

//////////////////////////////////////////////////////////
// Basic health check endpoint
app.get("/", (req, res) => {
  res.send("Movie Suggestion App Backend is running!");
});

// Search movies via TMDB
app.get("/api/movies/search", async (req, res) => {
  const { query } = req.query; // e.g., ?query=Avengers

  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }
  // console.log(process.env.TMDB_API_KEY);

  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          query: query,
        },
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        },
      }
    );

    // Return the results directly to the frontend
    res.json(response.data.results);
  } catch (error) {
    console.error("TMDB Search Error:", error.message);
    res.status(500).json({ error: "Failed to fetch data from TMDB" });
  }
});

app.get("/api/movies/saved", authenticateToken, async (req, res) => {
  try {
    const savedMovies = await prisma.user_saved_movies.findMany({
      where: {
        user_id: req.user.user_id, // Filter by current user
      },
      include: {
        movies: true, // Join with the Movies table to get title, poster, etc.
      },
      orderBy: {
        saved_at: "desc", // Newest saved first
      },
    });

    console.log(savedMovies);

    res.json(savedMovies);
  } catch (error) {
    console.error("Fetch Saved Error:", error);
    res.status(500).json({ error: "Failed to fetch saved movies." });
  }
});

//post movie
app.post("/api/movies/save", authenticateToken, async (req, res) => {
  console.log(req.body);

  const { tmdb_id } = req.body; // Expecting { "tmdb_id": 550 } from Flutter
  const user_id = req.user.user_id; // Got from the JWT token

  if (!tmdb_id) {
    return res.status(400).json({ error: "Movie ID (tmdb_id) is required." });
  }

  try {
    // 1. Check if movie exists locally

    console.log(typeof tmdb_id);
    let movie = await prisma.movies.findFirst({
      where: { tmdb_id: tmdb_id },
    });

    // 2. If NOT in DB, fetch from TMDB and create it
    if (!movie) {
      console.log(`Movie ${tmdb_id} not found locally. Fetching from TMDB...`);

      // Call TMDB API
      const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdb_id}`;
      const response = await axios.get(tmdbUrl, {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      });
      const movieData = response.data;
    //   console.log(movieData);

      // Extract genres (TMDB returns array of objects like [{id: 1, name: "Action"}])
      // We just want ["Action", "Thriller"]
      const genres = movieData.genres
        ? movieData.genres.map((g) => g.name)
        : [];

      // Save to 'movies' table
      var new_movie_id =await generateUniqueMovieId();
      console.log(new_movie_id);
      
      movie = await prisma.movies.create({
        data: {
          movie_id: new_movie_id,
          tmdb_id: movieData.id,
          title: movieData.title,
          release_year: movieData.release_date
            ? new Date(movieData.release_date).getFullYear().toString()
            : null,
          poster_url: movieData.poster_path
            ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}`
            : null,
          genres: genres,
          rating: movieData.vote_average.toString(),
        },
      });
      console.log(`Movie '${movie.title}' cached in local DB.`);
    }

    console.log(typeof tmdb_id);

    // 3. Link movie to the user (Handle duplicates)
    // Check if already saved
    const existingSave = await prisma.user_saved_movies.findFirst({
      where: {
        user_id: user_id,
        tmdb_id: tmdb_id,
      },
    });

    if (existingSave) {
      return res
        .status(409)
        .json({ message: "Movie is already in your list." });
    }

    // Create the link
    await prisma.user_saved_movies.create({
      data: {
        user_id: user_id,
        tmdb_id: tmdb_id,
        movie_id: movie.movie_id,
      },
    });

    res.status(201).json({ message: "Movie saved successfully!" });
  } catch (error) {
    console.error("Save Error:", error.message);

    // Handle TMDB errors (e.g. invalid ID)
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: "Movie not found on TMDB." });
    }

    res.status(500).json({ error: "Failed to save movie." });
  }
});

// --- Authentication Routes will go here ---
const bcrypt = require("bcrypt");
const saltRounds = 10;

//get user details
app.get("/auth/userInfo", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Use Prisma to find the unique user by their ID
    const user = await prisma.users.findUnique({
      where: {
        user_id: userId, // Ensure this matches your Prisma schema field name (e.g., id or user_id)
      },
      // Optional: Select specific fields if you don't want to return everything (like passwords)
      select: {
        user_id: true,
        username: true,
        email: true,
        // Add other fields you want to retrieve
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prisma returns a plain object, so we can send it directly as JSON
    res.json(user);

  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/auth/register", async (req, res) => {
  var { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res
      .status(400)
      .json({ error: "Please provide email, password, and username." });
  }

  try {
    //check if user already exists
    // const existingUser = await prisma.users.findUnique({
    //         where: { email: email },
    //     });

    //     if (existingUser) {
    //         return res.status(400).json({ error: 'User with this email already exists.' });
    //     }

    // 1. Hash the pasword
    password = await bcrypt.hash(password, saltRounds);

    // 2. Create the user in the database
    const user = await prisma.users.create({
      data: {
        username,
        email,
        password,
      },
    });

    res.status(201).json({
      message: "User registered successfully!",
      user,
    });
  } catch (error) {
    console.error("Registration error:", error);
    // Handle unique constraint violation (if unique constraints were kept)
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Username or email already in use." });
    }
    res
      .status(500)
      .json({ error: "Internal server error during registration." });
  }
});

const jwt = require("jsonwebtoken");
const { log } = require("console");

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  // 1. Validation: Ensure fields are present
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    // 2. Find the user (Use findFirst instead of findMany for efficiency)
    const user = await prisma.users.findFirst({
      where: { email: email },
    });

    // 3. Check if user exists
    if (!user) {
      // Return generic error to prevent email enumeration attacks
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // 4. Compare passwords
    // Note: Ensure your DB column is actually named 'password_hash' or change below to match
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // 5. Generate Token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 6. Respond (Exclude sensitive data like password_hash)
    res.json({
      message: "Login successful!",
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
      },
    });
    console.log(user);
  } catch (error) {
    console.error("Login error:", error); // Log the error object, not user data
    res.status(500).json({ error: "Internal server error during login." });
  }
});

//RECOMMENDATIONS USING GEMINI
app.get("/api/movies/recommendations",authenticateToken, async (req, res) => {
  const { service } = req.query;
  const user_id = req.user.user_id;
  console.log(`user id is ${user_id}`);
  if (!user_id) {
    return res.status(400).json({ error: "User ID is required." });
  }

  try {
    // 1. Fetch saved movies from Prisma
    const savedMovies = await prisma.user_saved_movies.findMany({
      where: { user_id: user_id },
      include: { movies: true },
    });

    // if (savedMovies.length === 0) {
    //   return res.json({
    //     recommendations: [],
    //     message: "No saved movies found to base recommendations on.",
    //   });
    // }

    // 2. Extract movie titles to create a context string
    // const favoriteTitles = savedMovies
    //   .map((item) => item.movies.title)
    //   .join(", ");


    // console.log(savedMovies[0].title);

    const prompt = `
You are a knowledgeable film recommender.

The user likes these movies:
${savedMovies}

Task:
Recommend movies based ONLY on what can be inferred from these titles.

Instructions:
- Infer shared emotional tone, intensity, themes, and storytelling approach
- Do NOT default to universally popular or all-time-great movies
- Avoid slow, sentimental, or purely contemplative films
  unless they are clearly implied by the input
- Do not force a single genre or mood
- Let multiple influences coexist, but keep recommendations
  close in energy and narrative drive to the input

Requirements:
- Recommend high-quality, well-reviewed films
- Each recommendation should feel plausible for this specific viewer

Output:
Return a JSON object with exactly one key: "recommendations"
The value must be an array of exactly 5 movie titles (strings)
Output JSON only. No explanations.

    `;
    console.log(service);
    // 3. Construct the Prompt
    // const prompt = `A user likes the following movies: ${savedMovies}. 
    //   Based on these, recommend 5 similar movies of similar type.
    //   Return the response as a simple JSON array of strings containing only the movie titles.
    //   `;
      

    // 4. Call Gemini
    if(service=="gemini"){
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: {
          responseMimeType: "application/json", // Enforces JSON output
        }
      });
      console.log(response.text);
      const rawText = response.text;
  
      // 5. Parse and Clean the response
      // (Gemini sometimes wraps JSON in markdown blocks like \`\`\`json)
      const cleanedText = rawText.replace(/```json|```/g, "").trim();
      const recommendations = JSON.parse(cleanedText);  
      res.json({ recommendations });
    }else if(service=="groq"){
      const completion = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are an expert film recommender. Analyze tone, intensity, pacing, and storytelling to infer user taste. Output valid JSON only."
          },
          {
            role: "user",
            content: `
      User's favorite movies:
      ${savedMovies}
      
      TASK:
      Infer the user's taste from the shared tone, intensity, conflict, pacing, and narrative drive.
      
      INSTRUCTIONS:
      - Base recommendations strictly on the given movies
      - Match energy, seriousness, and narrative momentum
      - Let multiple influences coexist naturally
      - Avoid slow, sentimental, or purely conceptual films unless clearly implied
      - Prefer films driven by human conflict and stakes
      - Do not force a single genre or mood
      
      QUALITY BAR:
      Recommend well-regarded, thoughtfully made films that a viewer with this mix of tastes would plausibly enjoy.
      
      OUTPUT:
      Return a JSON object with one key: "recommendations"
      The value must be an array of exactly 5 movie titles (strings).
      Output JSON only.
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.55,
      });
      
      
      
  
      // 4. Parse the response
      const content = completion.choices[0].message.content;
      const parsedResult = JSON.parse(content);
      res.json({ recommendations: parsedResult.recommendations });
    }else{
      res.status(400).json({ error: "Invalid service." });
    }
  } catch (error) {
    console.error("Recommendations error:", error);
    res
      .status(500)
      .json({ error: "Internal server error during recommendations." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
