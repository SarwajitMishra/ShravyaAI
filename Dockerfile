# Use the full Node.js 18 image to ensure all build tools are available
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install app dependencies using a clean install for reliability
RUN npm ci

# Bundle app source
COPY . .

# Your app binds to the PORT environment variable
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "voice-server.js" ]
