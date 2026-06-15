FROM node:20

WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install packages
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 5000

# Start server after running database push and seed scripts
CMD ["sh", "-c", "npx prisma db push && npx prisma db seed && npm run start"]
