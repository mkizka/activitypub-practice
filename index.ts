// https://zenn.dev/tkithrta/articles/78b203b30f689f
import fs from "fs";
import crypto from "crypto";
import path from "path";
import fastify from "fastify";
import axios from "axios";

const app = fastify({ trustProxy: true }) as any;

app.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/public/",
});
app.addContentTypeParser(
  "application/activity+json",
  { parseAs: "string" },
  // @ts-ignore
  app.getDefaultJsonParser()
);

let private_key_pem = fs.readFileSync("./private.pem", "utf-8");
if (private_key_pem.startsWith('"')) private_key_pem = private_key_pem.slice(1);
if (private_key_pem.endsWith('"'))
  private_key_pem = private_key_pem.slice(0, -1);
private_key_pem = private_key_pem.split("\\n").join("\n");
const PRIVATE_KEY = private_key_pem;
const PUBLIC_KEY = crypto
  .createPublicKey(PRIVATE_KEY)
  .export({ type: "spki", format: "pem" });
const CONFIG = { preferredUsername: "a", name: "Alice" };

function talkScript(req) {
  return `<p><a href="https://${new URL(req).hostname}/">${
    new URL(req).hostname
  }</a></p>`;
}

async function getInbox(req) {
  console.log(req);
  const res = await axios.get(req, {
    headers: { Accept: "application/activity+json" },
  });
  return res.data;
}

async function postInbox(req, data, headers) {
  console.log(req, data);
  await axios.post(req, JSON.stringify(data), { headers });
}

function signHeaders(res, strName, strHost, strInbox) {
  const strTime = new Date().toUTCString();
  const s256 = crypto
    .createHash("sha256")
    .update(JSON.stringify(res))
    .digest("base64");
  const sig = crypto
    .createSign("sha256")
    .update(
      `(request-target): post ${new URL(strInbox).pathname}\n` +
        `host: ${new URL(strInbox).host}\n` +
        `date: ${strTime}\n` +
        `digest: SHA-256=${s256}`
    )
    .end();
  const b64 = sig.sign(PRIVATE_KEY, "base64");
  const headers = {
    Host: new URL(strInbox).host,
    Date: strTime,
    Digest: `SHA-256=${s256}`,
    Signature:
      `keyId="https://${strHost}/u/${strName}",` +
      `algorithm="rsa-sha256",` +
      `headers="(request-target) host date digest",` +
      `signature="${b64}"`,
    Accept: "application/activity+json",
    "Content-Type": "application/activity+json",
    "Accept-Encoding": "gzip",
    "User-Agent": `StrawberryFields-Fastify/2.3.0 (+https://${strHost}/)`,
  };
  return headers;
}

async function acceptFollow(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = x.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Accept",
    actor: `https://${strHost}/u/${strName}`,
    object: y,
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function follow(strName, strHost, x) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = x.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Follow",
    actor: `https://${strHost}/u/${strName}`,
    object: x.id,
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function undoFollow(strName, strHost, x) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = x.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Undo",
    actor: `https://${strHost}/u/${strName}`,
    object: {
      type: "Follow",
      object: x.id,
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function like(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = y.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Like",
    actor: `https://${strHost}/u/${strName}`,
    object: x.id,
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function undoLike(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = y.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Undo",
    actor: `https://${strHost}/u/${strName}`,
    object: {
      type: "Like",
      object: x.id,
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function announce(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strTime = new Date().toISOString().substring(0, 19) + "Z";
  const strInbox = y.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Announce",
    actor: `https://${strHost}/u/${strName}`,
    published: strTime,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [`https://${strHost}/u/${strName}/followers`],
    object: x.id,
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function undoAnnounce(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = y.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}`,
    type: "Undo",
    actor: `https://${strHost}/u/${strName}`,
    object: {
      type: "Announce",
      object: x.id,
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function createNote(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strTime = new Date().toISOString().substring(0, 19) + "Z";
  const strInbox = x.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}/activity`,
    type: "Create",
    actor: `https://${strHost}/u/${strName}`,
    published: strTime,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [`https://${strHost}/u/${strName}/followers`],
    object: {
      id: `https://${strHost}/u/${strName}/s/${numId}`,
      type: "Note",
      attributedTo: `https://${strHost}/u/${strName}`,
      content: talkScript(y),
      url: `https://${strHost}/u/${strName}/s/${numId}`,
      published: strTime,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [`https://${strHost}/u/${strName}/followers`],
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function createNoteMention(strName, strHost, x, y, z) {
  const numId = Math.floor(Date.now() / 1000);
  const strTime = new Date().toISOString().substring(0, 19) + "Z";
  const strInbox = y.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}/activity`,
    type: "Create",
    actor: `https://${strHost}/u/${strName}`,
    published: strTime,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [`https://${strHost}/u/${strName}/followers`],
    object: {
      id: `https://${strHost}/u/${strName}/s/${numId}`,
      type: "Note",
      attributedTo: `https://${strHost}/u/${strName}`,
      inReplyTo: x.id,
      content: talkScript(z),
      url: `https://${strHost}/u/${strName}/s/${numId}`,
      published: strTime,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [`https://${strHost}/u/${strName}/followers`],
      tag: [
        {
          type: "Mention",
          name: `@{y.preferredUsername}@${new URL(strInbox).hostname}`,
        },
      ],
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function createNoteHashtag(strName, strHost, x, y, z) {
  const numId = Math.floor(Date.now() / 1000);
  const strTime = new Date().toISOString().substring(0, 19) + "Z";
  const strInbox = x.inbox;
  const res = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      { Hashtag: "as:Hashtag" },
    ],
    id: `https://${strHost}/u/${strName}/s/${numId}/activity`,
    type: "Create",
    actor: `https://${strHost}/u/${strName}`,
    published: strTime,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [`https://${strHost}/u/${strName}/followers`],
    object: {
      id: `https://${strHost}/u/${strName}/s/${numId}`,
      type: "Note",
      attributedTo: `https://${strHost}/u/${strName}`,
      content: talkScript(y),
      url: `https://${strHost}/u/${strName}/s/${numId}`,
      published: strTime,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [`https://${strHost}/u/${strName}/followers`],
      tag: [
        {
          type: "Hashtag",
          name: `#${z}`,
        },
      ],
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

async function deleteNote(strName, strHost, x, y) {
  const numId = Math.floor(Date.now() / 1000);
  const strInbox = x.inbox;
  const res = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/s/${numId}/activity`,
    type: "Delete",
    actor: `https://${strHost}/u/${strName}`,
    object: {
      id: y,
      type: "Note",
    },
  };
  const headers = signHeaders(res, strName, strHost, strInbox);
  await postInbox(strInbox, res, headers);
}

app.get("/", (_req, res) =>
  res.type("text/plain; charset=utf-8").send("StrawberryFields Fastify")
);

app.get("/u/:strName", (req, res) => {
  const strName = req.params.strName;
  const strHost = req.hostname.split(":")[0];
  if (strName !== CONFIG.preferredUsername) return res.callNotFound();
  if (!req.headers["accept"].includes("application/activity+json")) {
    return res
      .type("text/plain; charset=utf-8")
      .send(`${strName}: ${CONFIG.name}`);
  }
  const r = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
    ],
    id: `https://${strHost}/u/${strName}`,
    type: "Person",
    inbox: `https://${strHost}/u/${strName}/inbox`,
    outbox: `https://${strHost}/u/${strName}/outbox`,
    following: `https://${strHost}/u/${strName}/following`,
    followers: `https://${strHost}/u/${strName}/followers`,
    preferredUsername: strName,
    name: CONFIG.name,
    summary: `<p>2.3.0</p>`,
    url: `https://${strHost}/u/${strName}`,
    publicKey: {
      id: `https://${strHost}/u/${strName}`,
      type: "Key",
      owner: `https://${strHost}/u/${strName}`,
      publicKeyPem: PUBLIC_KEY,
    },
    icon: {
      type: "Image",
      mediaType: "image/png",
      url: `https://${strHost}/public/${strName}u.png`,
    },
    image: {
      type: "Image",
      mediaType: "image/png",
      url: `https://${strHost}/public/${strName}s.png`,
    },
  };
  res.type("application/activity+json").send(r);
});

app.get("/u/:strName/inbox", async (_req, res) =>
  res.code(405).send(new Error(res.statusCode))
);
app.post("/u/:strName/inbox", async (req, res) => {
  const strName = req.params.strName;
  const strHost = req.hostname.split(":")[0];
  if (strName !== CONFIG.preferredUsername) return res.callNotFound();
  if (!req.headers["content-type"].includes("application/activity+json")) {
    return res.code(400).send(new Error(res.statusCode));
  }
  const y = req.body;
  if (new URL(y.actor).protocol !== "https:")
    return res.code(400).send(new Error(res.statusCode));
  console.log(y.id, y.type);
  const x = await getInbox(y.actor);
  if (!x) return res.code(500).send(new Error(res.statusCode));
  if (y.type === "Follow") {
    await acceptFollow(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  if (y.type === "Like" || y.type === "Announce")
    return res.code(200).raw.end();
  if (y.type === "Undo") {
    const z = y.object;
    if (z.type === "Follow") {
      await acceptFollow(strName, strHost, x, z);
      return res.code(200).raw.end();
    }
    if (z.type === "Like" || z.type === "Announce")
      return res.code(200).raw.end();
  }
  if (y.type === "Accept" || y.type === "Reject")
    return res.code(200).raw.end();
  if (y.type === "Create" || y.type === "Update" || y.type === "Delete")
    return res.code(200).raw.end();
  res.code(500).send(new Error(res.statusCode));
});

app.post("/u/:strName/outbox", (_req, res) =>
  res.code(405).send(new Error(res.statusCode))
);
app.get("/u/:strName/outbox", (req, res) => {
  const strName = req.params.strName;
  const strHost = req.hostname.split(":")[0];
  if (strName !== CONFIG.preferredUsername) return res.callNotFound();
  if (!req.headers["accept"].includes("application/activity+json")) {
    return res.code(400).send(new Error(res.statusCode));
  }
  const r = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/outbox`,
    type: "OrderedCollection",
    totalItems: 0,
  };
  res.type("application/activity+json").send(r);
});

app.get("/u/:strName/following", (req, res) => {
  const strName = req.params.strName;
  const strHost = req.hostname.split(":")[0];
  if (strName !== CONFIG.preferredUsername) return res.callNotFound();
  if (!req.headers["accept"].includes("application/activity+json")) {
    return res.code(400).send(new Error(res.statusCode));
  }
  const r = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/following`,
    type: "OrderedCollection",
    totalItems: 0,
  };
  res.type("application/activity+json").send(r);
});

app.get("/u/:strName/followers", (req, res) => {
  const strName = req.params.strName;
  const strHost = req.hostname.split(":")[0];
  if (strName !== CONFIG.preferredUsername) return res.callNotFound();
  if (!req.headers["accept"].includes("application/activity+json")) {
    return res.code(400).send(new Error(res.statusCode));
  }
  const r = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${strHost}/u/${strName}/followers`,
    type: "OrderedCollection",
    totalItems: 0,
  };
  res.type("application/activity+json").send(r);
});

app.post("/s/:strSecret/u/:strName", async (req, res) => {
  const strName = req.params.strName;
  const strHost = req.hostname.split(":")[0];
  if (strName !== CONFIG.preferredUsername) return res.callNotFound();
  if (!req.params.strSecret || req.params.strSecret === "-")
    return res.callNotFound();
  if (req.params.strSecret !== process.env.SECRET) return res.callNotFound();
  if (!req.query.id || !req.query.type)
    return res.code(400).send(new Error(res.statusCode));
  if (new URL(req.query.id).protocol !== "https:")
    return res.code(400).send(new Error(res.statusCode));
  const x = await getInbox(req.query.id);
  if (!x) return res.code(500).send(new Error(res.statusCode));
  const t = req.query.type;
  if (t === "type") {
    console.log(x.type);
    return res.code(200).raw.end();
  }
  if (t === "follow") {
    await follow(strName, strHost, x);
    return res.code(200).raw.end();
  }
  if (t === "undo_follow") {
    await undoFollow(strName, strHost, x);
    return res.code(200).raw.end();
  }
  if (t === "like") {
    const y = await getInbox(x.attributedTo);
    if (!y) return res.code(500).send(new Error(res.statusCode));
    await like(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  if (t === "undo_like") {
    const y = await getInbox(x.attributedTo);
    if (!y) return res.code(500).send(new Error(res.statusCode));
    await undoLike(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  if (t === "announce") {
    const y = await getInbox(x.attributedTo);
    if (!y) return res.code(500).send(new Error(res.statusCode));
    await announce(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  if (t === "undo_announce") {
    const y = await getInbox(x.attributedTo);
    if (!y) return res.code(500).send(new Error(res.statusCode));
    await undoAnnounce(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  if (t === "create_note") {
    const y = req.query.url;
    if (new URL(y).protocol !== "https:")
      return res.code(400).send(new Error(res.statusCode));
    await createNote(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  if (t === "create_note_mention") {
    const y = await getInbox(x.attributedTo);
    if (!y) return res.code(500).send(new Error(res.statusCode));
    const z = req.query.url;
    if (new URL(z).protocol !== "https:")
      return res.code(400).send(new Error(res.statusCode));
    await createNoteMention(strName, strHost, x, y, z);
    return res.code(200).raw.end();
  }
  if (t === "create_note_hashtag") {
    const y = req.query.url;
    if (new URL(y).protocol !== "https:")
      return res.code(400).send(new Error(res.statusCode));
    const z = req.query.tag;
    await createNoteHashtag(strName, strHost, x, y, z);
    return res.code(200).raw.end();
  }
  if (t === "delete_note") {
    const y = req.query.url;
    if (new URL(y).protocol !== "https:")
      return res.code(400).send(new Error(res.statusCode));
    await deleteNote(strName, strHost, x, y);
    return res.code(200).raw.end();
  }
  res.code(500).send(new Error(res.statusCode));
});

app.get("/.well-known/webfinger", (req, res) => {
  const strName = CONFIG.preferredUsername;
  const strHost = req.hostname.split(":")[0];
  if (req.query.resource !== `acct:${strName}@${strHost}`)
    return res.callNotFound();
  const r = {
    subject: `acct:${strName}@${strHost}`,
    aliases: [
      `https://${strHost}/@${strName}`,
      `https://${strHost}/u/${strName}`,
      `https://${strHost}/user/${strName}`,
      `https://${strHost}/users/${strName}`,
    ],
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `https://${strHost}/u/${strName}`,
      },
    ],
  };
  res.type("application/jrd+json").send(r);
});

app.get("/@", (_req, res) => res.redirect("/"));
app.get("/u", (_req, res) => res.redirect("/"));
app.get("/user", (_req, res) => res.redirect("/"));
app.get("/users", (_req, res) => res.redirect("/"));

app.get("/users/:strName", (req, res) =>
  res.redirect(`/u/${req.params.strName}`)
);
app.get("/user/:strName", (req, res) =>
  res.redirect(`/u/${req.params.strName}`)
);
app.get("/@:strName", (req, res) => res.redirect(`/u/${req.params.strName}`));

app
  .listen({
    port: parseInt(process.env.PORT || "8000"),
    host: process.env.HOSTS || "0.0.0.0",
  })
  .then(() => console.log("listen: http://localhost:8000"));
