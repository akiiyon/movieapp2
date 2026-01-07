# Use a lightweight Node.js image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to leverage Docker caching for layers
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the prisma directory to generate the client
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy the rest of your backend source code
COPY . .

# Expose the port your server.js uses (usually 3000 or 8080)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]