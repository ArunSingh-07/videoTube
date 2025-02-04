import multer from "multer";

// Configure file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/temp"); // Store files in the 'temp' folder
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Avoid filename collisions with a timestamp
  },
});

// Create the Multer upload instance and limit accepted fields to 'avatar' and 'coverImage'
export const upload = multer({
  storage: storage,
});
