# The API: transactions the platform pays for, the clips people send, and the film made of them.
FROM node:26-alpine

# The film is joined with ffmpeg, and its running time is asked of ffprobe.
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/src ./src

ENV NODE_ENV=production
# Recordings are the product, and a container's own disk does not survive it. Mount a volume at
# /data or every clip is lost on the next deploy.
ENV CLIP_DIR=/data/clips
ENV FILM_DIR=/data/films
EXPOSE 8787

CMD ["node", "src/index.ts"]
