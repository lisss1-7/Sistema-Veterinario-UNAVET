const fs = require('fs/promises');
const {
  createReadStream,
  getMediaFile,
  verifySignedMediaRequest,
} = require('../utils/mediaStorage');

const servirImagen = async (req, res) => {
  const { bucket, filename } = req.params;

  if (
    !verifySignedMediaRequest({
      bucket,
      filename,
      expires: req.query.expires,
      signature: req.query.signature,
    })
  ) {
    return res.status(403).json({ message: 'El enlace de la imagen no es válido o expiró' });
  }

  const media = getMediaFile(bucket, filename);
  if (!media) {
    return res.status(404).json({ message: 'Imagen no encontrada' });
  }

  try {
    const stat = await fs.stat(media.filePath);
    if (!stat.isFile()) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }

    res.set({
      'Cache-Control': 'private, max-age=300',
      'Content-Length': String(stat.size),
      'Content-Type': media.contentType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    });

    const stream = createReadStream(media.filePath);
    stream.on('error', (error) => res.destroy(error));
    return stream.pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    throw error;
  }
};

module.exports = { servirImagen };
