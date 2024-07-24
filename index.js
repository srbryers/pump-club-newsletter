const functions = require('@google-cloud/functions-framework');
const dotenv = require('dotenv').config({ path: __dirname + '/.env' });
const moment = require('moment');

const environment = process.env['ENVIRONMENT'];
const beehiivApiKey = process.env['BEEHIIV_API_KEY'];
const beehiivPublicationId = process.env['BEEHIIV_PUBLICATION_ID'];
const shopifyApiKey = process.env['SHOPIFY_API_KEY'];
const shopifyBlogId = process.env['SHOPIFY_BLOG_ID'];
const shopifyApiVersion = process.env['SHOPIFY_API_VERSION'];

const helpers = {
    sleep: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    imageUrlToBase64: async (url) => {
        try {
            const response = await fetch(url);

            const blob = await response.arrayBuffer();

            const contentType = response.headers.get('content-type');

            const base64String = `data:${contentType};base64,${Buffer.from(
                blob,
            ).toString('base64')}`;

            return base64String;
        } catch (err) {
            console.log(err);
        }
    }
}

const beehiiv = {
    getPosts: async (maxPosts) => {

        const posts = [];

        console.log(`[asyncGetPosts] getting posts - maxPosts: ${maxPosts}`)

        const asyncGetPosts = async (page) => {
            page = page || 1;

            const contentType = 'free_rss_content';
            const status = 'confirmed';
            const limit = maxPosts < 50 ? maxPosts : 50;
            const url = `https://api.beehiiv.com/v2/publications/${beehiivPublicationId}/posts?expand%5B%5D=${contentType}&status=${status}&limit=${limit}&direction=desc&page=${page}`;
            const options = {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${beehiivApiKey}`
                }
            }

            try {
                const response = await fetch(url, options);
                const json = await response.json();

                console.log(`[asyncGetPosts] got page: ${page}/${json.total_pages} - ${json.data.length} posts`)
                posts.push(json.data);

                // Check that we have more pages to get, and that we haven't exceeded the max # of posts requested
                if (json.page < json.total_pages && posts.flat().length < (maxPosts || json.total_results)) {
                    await asyncGetPosts(json.page + 1)
                } else {
                    return;
                }
            } catch (error) {
                console.error(error);
            }
        }

        await asyncGetPosts();

        return posts.flat();

    },
    getPost: async (postId) => {
        const url = `https://api.beehiiv.com/v2/publications/${beehiivPublicationId}/posts/${postId}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${beehiivApiKey}`
            }
        }

        try {
            const response = await fetch(url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error);
        }

    },
    getSubscriptions: async (email) => {
        const url = `https://api.beehiiv.com/v2/publications/${beehiivPublicationId}/subscriptions?email=${encodeURIComponent(email)}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${beehiivApiKey}`
            }
        }

        try {
            const response = await fetch(url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error);
        }
    },
    updateSubscription: async (subscriptionId, data) => {

        const url = `https://api.beehiiv.com/v2/publications/${beehiivPublicationId}/subscriptions/${subscriptionId}`;
        const options = {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${beehiivApiKey}`
            },
            body: JSON.stringify(data)
        }

        try {
            const response = await fetch(url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error);
        }
    },
    createSubscription: async (data) => {
        
        var existingSubscription = (await beehiiv.getSubscriptions(data.email)).data[0];

        if (existingSubscription) {
            // We have an existing subscription, so update the user
            return beehiiv.updateSubscription(existingSubscription.id, data)
            // return existingSubscription;
        } else {

            const url = `https://api.beehiiv.com/v2/publications/${beehiivPublicationId}/subscriptions`;
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${beehiivApiKey}`
                },
                body: JSON.stringify(data)
            }

            try {
                const response = await fetch(url, options);
                const json = await response.json();
                return json;
            } catch (error) {
                console.error(error);
            }

        }
    }

}

const shopify = {
    getArticles: async (handle) => {

        const query = handle ? `?handle=${handle}` : '';
        const url = `https://arnolds-pump-club.myshopify.com/admin/api/${shopifyApiVersion}/blogs/${shopifyBlogId}/articles.json${query}`;

        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shopifyApiKey
            }
        }

        try {
            const response = await fetch(url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error)
        }

    },
    createArticle: async (post) => {

        const url = `https://arnolds-pump-club.myshopify.com/admin/api/${shopifyApiVersion}/blogs/${shopifyBlogId}/articles.json`;
        const isHidden = post.content_tags.includes('hidden');

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shopifyApiKey
            },
            body: JSON.stringify({
                article: {
                    title: post.title,
                    handle: post.slug,
                    summary_html: post.subtitle,
                    body_html: post.content.free.rss,
                    published_at: !isHidden ? moment.unix(post.publish_date).format('YYYY-MM-DDTHH:mm:ssZ') : null,
                    image: {
                        src: post.thumbnail_url
                    }
                }
            })
        }
        try {
            const response = await fetch(url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error("error:", error.errors);
        }
    },
    updateArticle: async (articleId, data) => {

        const url = `https://arnolds-pump-club.myshopify.com/admin/api/${shopifyApiVersion}/blogs/${shopifyBlogId}/articles/${articleId}.json`;
        const isHidden = data.content_tags.includes('hidden');

        const options = {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shopifyApiKey
            },
            body: JSON.stringify({
                article: {
                    title: data.title,
                    body_html: data.content.free.rss,
                    summary_html: data.subtitle,
                    published_at: !isHidden ? moment.unix(data.publish_date).format('YYYY-MM-DDTHH:mm:ssZ') : null,
                    image: {
                        src: data.thumbnail_url
                    }
                }
            })
        }
        try {
            const response = await fetch(url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error);
        }
    }
}

const actions = {
    syncPosts: async (req) => {
        const daysSincePublished = req ? req.query.daysSincePublished : 30;
        const updateArticles = req ? req.query.updateArticles : false;
        const startDate = moment().subtract(daysSincePublished, 'days').unix();
        const result = {
            created: [],
            updated: [],
            skipped: [],
            errors: []
        };
        const posts = (await beehiiv.getPosts(req.query.maxPosts)).filter(post => {
            return post.publish_date >= startDate;
        })

        console.log("[processFunction] # of posts", posts.length)

        for (var i = 0; i < posts.length; i++) {

            console.log(`[processFunction] processing post ${i + 1}/${posts.length}:`, posts[i].slug)

            var post = posts[i];
            // First, check to see if there is an existing article
            const existingArticle = await shopify.getArticles(post.slug);
            await helpers.sleep(600); // Sleep for 600ms to avoid rate limiting

            if (existingArticle.articles.length > 0 && !updateArticles) {
                // If there is an existing article, and we don't want to update it, skip it
                console.log(`[shopify] skipping article ${i + 1}/${posts.length}:`, post.slug)
                result.skipped.push({
                    handle: post.slug
                });
            } else if (existingArticle.articles.length > 0) {
                // If there is an existing article, update it
                var articleId = existingArticle.articles[0].id;
                var res = await shopify.updateArticle(articleId, post);

                if (res.errors) {
                    console.log(`[shopify] error updating article ${i + 1}/${posts.length}:`, post.slug, JSON.stringify(res.errors))
                    result.errors.push({
                        handle: post.slug,
                        error: JSON.stringify(res.errors)
                    });
                } else {
                    console.log(`[shopify] updated article ${i + 1}/${posts.length}:`, res.article.handle)
                    result.updated.push({
                        handle: res.article.handle
                    });
                }

            } else {

                var res = await shopify.createArticle(post);

                // If we have errors, check what errors they are
                if (res.errors) {
                    console.log(`[shopify] error creating article ${i + 1}/${posts.length}:`, post.slug, JSON.stringify(res.errors))
                    result.errors.push({
                        handle: post.slug,
                        error: JSON.stringify(res.errors)
                    });
                } else if (res.article) {
                    console.log(`[shopify] created article ${i + 1}/${posts.length}:`, res.article.handle)
                    // Otherwise, the aricle was created successfully
                    result.created.push({
                        handle: res.article.handle,
                    });
                }
            }


        }

        return result;
    },
    createSubscription: async (req) => {
        const result = await beehiiv.createSubscription(req.body);
        return result;
    }
}

const processFunction = async (req, res) => {

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;

    } else {

        if (environment === "production") {
            res.set('Access-Control-Allow-Origin', '*');
        }

        if (!req.query.action) {
            res.status(400).send('Must provide a valid action in the query parameters');
            return;
        } else if (actions[req.query.action]) {

            const result = await actions[req.query.action](req);

            // Return the result
            if (environment === 'production') {
                console.log("[prod][processFunction] result", JSON.stringify(result))
                res.send(result);
            } else {
                console.log("[dev][processFunction] result", result);
                return;
            }

        } else {
            res.status(404).send('Action not found');
            return;
        }
    }

}

functions.http('newsletter', (req, res) => {
    return processFunction(req, res)
})

if (environment === 'development') {
    /* Action: syncPosts */
      processFunction({
        method: 'GET',
        query: {
          action: 'syncPosts',
          updateArticles: true,
          daysSincePublished: 7,
          // maxPosts: 2
        }
      });
    /* Action: createSubscription */
    // processFunction({
    //     method: 'POST',
    //     query: {
    //         action: 'createSubscription'
    //     },
    //     body: {
    //         email: "sebastian@ora.organic",
    //         send_welcome_email: true,
    //         utm_source: "arnoldspumpclub.com",
    //         utm_medium: "referral",
    //         utm_campaign: "Newsletter",
    //         referring_site: "https://arnoldspumpclub.com",
    //         custom_fields: [
    //             {
    //                 "name": "subscription_type",
    //                 "value": "Sold Out Notification"
    //             }
    //         ]
    //     }
    // });
}