FROM node:18

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apt-get install git
RUN git clone https://github.com/keianhzo/hubs-chat-bot code
WORKDIR code
RUN npm ci

# Bundle app source
COPY . .

EXPOSE 3000
CMD [ "npm", "run", "start" ]