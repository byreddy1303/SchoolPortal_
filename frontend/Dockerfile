FROM node:20-alpine AS build

WORKDIR /app
ARG VITE_SESSION_TIMEOUT_MINUTES=15
ENV VITE_SESSION_TIMEOUT_MINUTES=$VITE_SESSION_TIMEOUT_MINUTES

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
