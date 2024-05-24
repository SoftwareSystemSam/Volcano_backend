var express = require("express");
var router = express.Router();
const { optionalAuthenticateVolcano, authenticate } = require('../middleware/authorization');
const {optionalAuthenticate} = require('../middleware/authorization')


/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});



/* GET /countries */
router.get('/countries', async (req, res) => {
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({
      error: true,
      message: "Invalid query parameters. Query parameters are not permitted."
    });
  }

  try {
    const countries = await req.db.select('country').from('data')
      .distinct()
      .orderBy('country');

    const countryList = countries.map(entry => entry.country);
    res.status(200).json(countryList);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
});

router.get('/volcanoes', optionalAuthenticate, (req, res) => {
  const { country, populatedWithin } = req.query;
  const validParameters = ['country', 'populatedWithin'];
  const validDistances = ['5km', '10km', '30km', '100km'];

  // Check for invalid query parameters
  const keys = Object.keys(req.query);
  if (keys.some(key => !validParameters.includes(key))) {
      return res.status(400).json({
          error: true,
          message: "Invalid query parameter."
      });
  }

  // Validate required 'country' query parameter
  if (!country) {
      return res.status(400).json({
          error: true,
          message: "Country is a required query parameter."
      });
  }

  let query = req.db.from('data').select(
      'id', 'name', 'country', 'region', 'subregion',
      'last_eruption', 'summit', 'elevation', 
      'latitude', 'longitude'
  ).where({ country });

  // Handle the 'populatedWithin' parameter if present
  if (populatedWithin) {
      if (!validDistances.includes(populatedWithin)) {
          return res.status(400).json({
              error: true,
              message: "Invalid populatedWithin parameter. Only 5km, 10km, 30km, 100km are permitted."
          });
      }
      query = query.where(`population_${populatedWithin.slice(0, -2)}km`, '>', 0);
  }

  query.then(volcanoes => {
      res.status(200).json(volcanoes);
  })
  .catch(err => {
      console.error(err);
      res.status(500).json({
          error: true,
          message: "Internal server error"
      });
  });
});



/* GET /volcano/{id} */
router.get('/volcano/:id', optionalAuthenticateVolcano, async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  console.log("The id that was grabbed from the URL is:", id);
  // Validate 'id' parameter
  if (isNaN(id)) {
    return res.status(400).json({
      error: true,
      message: "Invalid parameter: id must be a number."
    });
  }

  try {
    // Query to fetch volcano details
    let query = req.db.from('data').select(
      'id', 'name', 'country', 'region', 'subregion',
      'last_eruption', 'summit', 'elevation',
      'latitude', 'longitude'
    ).where({ id });

    // If valid JWT, add population data to the query
    if (user) {
      query = query.select(
        'population_5km', 'population_10km',
        'population_30km', 'population_100km'
      );
    }

    const volcano = await query.first();
    // console.log(" The volcano is:" ,volcano);
    // console.log("The volcano.id is", volcano.id);
    
    if (!volcano || !volcano.id) {
      return res.status(404).json({
        error: true,
        message: "Volcano ID not found"
      });
    }

    res.status(200).json(volcano);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
});

// GET endpoint to retrieve comments and average rating for a specific volcano
router.get('/volcanoes/:id/comments', async (req, res) => {
  const { id } = req.params;
  try {
    const comments = await req.db('comments').select('comment', 'rating').where({volcano_id: id});
    if (comments.length === 0) {
      return res.status(404).json({ error: true, message: "No comments found for this volcano." });
    }
    const averageResult = await req.db('comments').where({volcano_id: id}).avg('rating as averageRating').first();
    res.status(200).json({ comments, averageRating: averageResult.averageRating ? parseFloat(averageResult.averageRating) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal server error" });
  }
});

// POST endpoint to allow users to comment on and rate volcanoes
router.post('/volcanoes/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { userId, comment, rating } = req.body;
  try {
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating value' });
    }
    await req.db('comments').insert({ user_id: userId, volcano_id: id, comment: comment, rating: rating });
    res.status(200).json({ message: 'Comment added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal server error" });
  }
});

// GET endpoint to retrieve photos for a specific volcano
router.get('/volcanoes/:id/photos', async (req, res) => {
  const { id } = req.params;
  try {
    const photos = await req.db('volcano_photos').select('photo_url').where({volcano_id: id});
    if (photos.length === 0) {
      return res.status(404).json({ error: true, message: "No photos found for this volcano." });
    }
    res.status(200).json({ photos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal server error" });
  }
});

// POST endpoint to allow users to upload photos of volcanoes
router.post('/volcanoes/:id/photos', authenticate, async (req, res) => {
  const { id } = req.params;
  const { userId, url } = req.body;
  try {
    // Check if the user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: true, message: "Unauthorized" });
    }

    // Assume that req.user now contains user information if authenticated
    const volcano = await req.db('data').where({ id: id }).first();
    if (!volcano) {
      return res.status(404).json({ error: true, message: "Volcano not found" });
    }

    // Insert photo information into the database
    await req.db('volcano_photos').insert({ user_id: userId, volcano_id: id, photo_url: url });
    res.status(200).json({ message: 'Photo added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal server error" });
  }
});

/* GET /me*/
router.get('/me', (req, res) => {
  res.status(200).json({
    name: "Samuel Smith",
    student_number: "n11064196"
  });
});







module.exports = router; 