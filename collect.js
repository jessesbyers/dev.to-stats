// collect.js

const axios = require("axios");
const r = require("rethinkdb");
const { getRethinkDB } = require("./reql.js");

// Get articles from dev.to
const getArticles = async function () {
  let articles = [];
  let page = 1;
  while (true) {
    let articles_page = await axios.get(
      "https://dev.to/api/articles/me?page=" + page,
      {
        headers: {
          "api-key": process.env.API_KEY,
        },
      }
    );
    articles.push(...articles_page.data);

    // If a page is not full we are done
    if (articles_page.data.length < 30) {
      break;
    }
  }
  return articles;
};

// Save article stats to RethinkDB
const saveStats = async function () {
  const now = new Date();
  let day = ("0" + now.getDate()).slice(-2);
  let month = ("0" + (now.getMonth() + 1)).slice(-2);
  let year = now.getFullYear();
  const today = year + "-" + month + "-" + day;
  console.log("Collect stats", today);

  // Get all articles and extract stats
  const articles = await getArticles();

  // Save stats
  let conn = await getRethinkDB();
  articles.forEach(async (article) => {
    let db_article = await r.table("articles").get(article.id).run(conn);
    if (!db_article) {
      // save article
      await r
        .table("articles")
        .insert({
          id: article.id,
          title: article.title,
          url: article.url,
          latest_stats: today,
        })
        .run(conn);
      // save stats
      await r
        .table("stats")
        .insert({
          article_id: article.id,
          date: today,
          comments: article.comments_count,
          reactions: article.public_reactions_count,
          views: article.page_views_count,
        })
        .run(conn);
    } else if (db_article.latest_stats < today) {
      // update article
      await r
        .table("articles")
        .get(article.id)
        .update({ latest_stats: today })
        .run(conn);
      // save stats
      await r
        .table("stats")
        .insert({
          article_id: article.id,
          date: today,
          comments: article.comments_count,
          reactions: article.public_reactions_count,
          views: article.page_views_count,
        })
        .run(conn);
    } else {
      console.log("Already got stats for article " + article.id);
    }
  });
};

// Run once immediately
saveStats();
// Interval should be less than 24h. Running more than once a day
// is not a problem but a missed day cannot be recovered.
const interval = 6 * 60 * 60 * 1000;
setInterval(saveStats, interval);
