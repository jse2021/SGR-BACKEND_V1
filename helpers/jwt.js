const jwt = require("jsonwebtoken");

const generarJWT = (id, user) => {
  return new Promise((resolve, reject) => {
    const payload = { id, user };
    jwt.sign(
      payload,
      process.env.SECRET_JWT_SEED,
      {
        expiresIn: "2h",
      },
      (err, token) => {
        if (err) {
          console.log(err);
          reject("No se pudo generar el token");
        }
        resolve(token);
      }
    );
  });
};

module.exports = {
  generarJWT,
};
