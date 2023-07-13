// ls -1 | parallel mogrify -format jpg -quality 90 {}/*.png "&&" rm {}/*.png
// NOTE set UV_THREADPOOL_SIZE env variable to higher value (eg. 50)

// CONFIG {

const maxParallel = 24;

const ext = "jpg";

const baseDir = "/home/martin/OSM/sh/";

const quality = 90;

const minZoom = 0;

const maxZoom = 19;

// } CONFIG

const { promises: fs } = require("fs");

const path = require("path");

const sharp = require("sharp");

async function generateZoom(sourceZoom) {
  const base = baseDir + sourceZoom;

  const baseLow = baseDir + (sourceZoom - 1);

  const coords = new Set();

  for (const file of await fs.readdir(base)) {
    const name = path.join(base, file);

    console.log(name);

    const x = Number(file);

    for (const file1 of await fs.readdir(name)) {
      const y = Number(file1.slice(0, -4));

      coords.add(`${Math.floor(x / 2)}/${Math.floor(y / 2)}`);
    }
  }

  console.log("Let's go...");

  let promises = [];

  for (const coord of [...coords].sort()) {
    console.log(sourceZoom + "/" + coord);

    const [x, y] = coord.split("/");

    const xx = x * 2;

    const yy = y * 2;

    const parts = [
      `${base}/${xx}/${yy}.${ext}`,
      `${base}/${xx}/${yy + 1}.${ext}`,
      `${base}/${xx + 1}/${yy}.${ext}`,
      `${base}/${xx + 1}/${yy + 1}.${ext}`,
    ];

    async function stitch(check) {
      chk: try {
        const s = await fs.stat(`${baseLow}/${x}/${y}.${ext}`);

        for (let i = 0; i < 4; i++) {
          try {
            const s1 = await fs.stat(parts[i]);

            if (s1.mtime > s.mtime) {
              break chk;
            }
          } catch {
            // ignore
          }
        }

        s.mtime

        return;
      } catch {
        // ignore
      }

      if (check) {
        await fs.mkdir(`${baseLow}/${x}`, { recursive: true });

        for (let i = 0; i < 4; i++) {
          try {
            await fs.stat(parts[i]);
          } catch {
            parts[i] = null;
          }
        }
      }

      const files = ["northwest", "southwest", "northeast", "southeast"]
        .map((gravity, i) => ({ input: parts[i], gravity }))
        .filter((a) => a.input);

      try {
        const buff = await sharp({
          create: {
            width: 512,
            height: 512,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        })
          .composite(files)
          .png({ compressionLevel: 0 })
          .toBuffer();

        await sharp(buff)
          // .resize({ width: 256, kernel: sharp.kernel.cubic })
          .resize({ width: 256 })
          .jpeg({ quality, mozjpeg: true })
          .toFile(`${baseLow}/${x}/${y}.${ext}`);
      } catch (err) {
        if (check) {
          console.log("Files", files);

          console.log(err);

          throw err;
        }

        await stitch(true);
      }
    }

    const p = stitch().then(() => {
      promises = promises.filter((pomise) => pomise !== p);
    });

    promises.push(p);

    if (promises.length > maxParallel) {
      await Promise.race(promises);
    }
  }

  await Promise.all(promises);
}

async function run() {
  for (let z = maxZoom; z > minZoom; z--) {
    console.log("Zoom:", z - 1);

    await generateZoom(z);
  }
}

run().then(() => {
  console.log("DONE");
});
