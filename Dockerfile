# Use official Node.js image as the base image
FROM node:20-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install project dependencies
RUN npm ci --only=production

# Copy project source code
COPY . .

# Expose the port the application runs on
EXPOSE 5000

# Start command (modify based on your startup script)
CMD ["node", "app.js"]