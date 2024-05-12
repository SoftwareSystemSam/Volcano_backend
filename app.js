require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const swaggerUI = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
const options = require("./knexfile.js");
const knex = require("knex")(options);
const cors = require('cors');
var morgan = require('morgan')





var app = express();
app.use((req, res, next) => {
  req.db = knex;
  next();
});



app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors());

// This redirects the main page to the swagger documents
app.get('/', (req, res) => {
  res.redirect('/docs');
});



// It's better to have one static files middleware
app.use(express.static(path.join(__dirname, 'public')));



// Swagger UI setup
app.use('/docs', swaggerUI.serve, swaggerUI.setup(swaggerDocument));

// Route handlers
var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
app.use("/", indexRouter);
app.use("/user", usersRouter);
app.get("/knex", function (req, res, next) {
  req.db.raw("SELECT VERSION()")
    .then((version) => console.log(version))
    .catch((err) => {
      console.log(err);
      throw err;
    });
  res.send("Version Logged successfully");
});

morgan(function (tokens, req, res) {
  return [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length'), '-',
    tokens['response-time'](req, res), 'ms'
  ].join(' ')
})

// 404 error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// General error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});


module.exports = app;
