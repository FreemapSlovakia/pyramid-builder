// NOTE set UV_THREADPOOL_SIZE env variable to higher value (eg. 50)

// CONFIG {

const maxParallel = 24;

const ext = "jpg";

const baseDir = "/media/martin/OSM/orto/ofmozaika2/";

const quality = 90;

const minZoom = 0;

const maxZoom = 19;

// } CONFIG

const { spawn } = require("child_process");

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
      // const name1 = path.join(name, file1);

      const y = Number(file1.slice(0, -4));

      // if (y > 300000) {
      //   // console.log("mv", name1, `${name}/${y}.jpg`);
      //   await Deno.rename(name1, `${name}/${524287 - y}.jpg`);
      // } else {
      //   console.log("???", y);
      // }

      coords.add(`${Math.floor(x / 2)}/${Math.floor(y / 2)}`);
    }
  }

  console.log("Let's go...");

  let promises = [];

  for (const coord of [...coords].sort()) {
    console.log(coord);

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
      try {
        await fs.stat(`${baseLow}/${x}/${y}.${ext}`);

        return;
      } catch (err) {
        // ignore
      }

      if (check) {
        await fs.mkdir(`${baseLow}/${x}`, { recursive: true });

        for (let i = 0; i < 4; i++) {
          try {
            await fs.stat(parts[i]);
          } catch (err) {
            parts[i] = null;
          }
        }
      }

      try {
        const buff = await sharp({
          create: {
            width: 512,
            height: 512,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        })
          .composite(
            ["northwest", "southwest", "northeast", "southeast"]
              .map((gravity, i) => ({ input: parts[i], gravity }))
              .filter((a) => a.input)
          )
          .png({ compressionLevel: 0 })
          .toBuffer();

        await sharp(buff)
          // .resize({ width: 256, kernel: sharp.kernel.cubic })
          .resize({ width: 256 })
          .jpeg({ quality, mozjpeg: true })
          .toFile(`${baseLow}/${x}/${y}.${ext}`);
      } catch (err) {
        if (check) {
          throw err;
        }

        stitch(true);
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
