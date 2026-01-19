import { DB } from "./db.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://refriend:refriend@localhost:5432/refriend";
const DOMAIN = Deno.env.get("DOMAIN") || "localhost:8000";

// Sample users with profiles
const users = [
  {
    username: "alice",
    password: "alice123",
    name: "Alice Johnson",
    bio: "Software developer and open source enthusiast. Love building things with TypeScript and Rust.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
  },
  {
    username: "bob",
    password: "bob123",
    name: "Bob Smith",
    bio: "Photographer and nature lover. Sharing moments from my adventures around the world.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
  },
  {
    username: "carol",
    password: "carol123",
    name: "Carol Williams",
    bio: "Writer, coffee addict, and cat person. Currently working on my first novel.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=carol",
  },
  {
    username: "dave",
    password: "dave123",
    name: "Dave Chen",
    bio: "Music producer and DJ. Electronic music is my passion. Check out my latest mixes!",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=dave",
  },
  {
    username: "eve",
    password: "eve123",
    name: "Eve Martinez",
    bio: "Security researcher and privacy advocate. Decentralization is the future!",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=eve",
  },
];

// Sample posts (will be assigned to random users)
const posts = [
  "Just deployed my first #Fedify app! The #ActivityPub protocol is really elegant once you get the hang of it.",
  "Morning coffee and code. The best combination. #coding #productivity",
  "Finally finished that feature I've been working on for weeks. Time to celebrate! #programming",
  "The sunset today was absolutely stunning. Wish I had my camera with me. #photography #nature",
  "Reading about distributed systems. Fascinating stuff! #tech #learning",
  "New blog post: Why I switched to #Deno for my backend projects. Link in bio!",
  "Hot take: Decentralized social media is the future. #fediverse #mastodon",
  "Just discovered a great new coffee shop downtown. Their espresso is amazing! #coffee #local",
  "Working on some new music today. Can't wait to share it with you all! #music #electronica",
  "The more I learn about #TypeScript, the more I appreciate its type system.",
  "Weekend project: Building a simple RSS reader. Sometimes the old ways are the best. #webdev",
  "Privacy matters. That's why I'm here instead of the big social networks. #privacy #fediverse",
  "Rainy day, perfect for staying in and reading. Currently enjoying a sci-fi novel. #books #reading",
  "Tip: Use Temporal API for date handling in JavaScript. It's so much better than Date! #javascript #tips",
  "Just hit 1000 lines of code on my side project. Progress feels good! #coding #sideproject",
  "The #opensource community is amazing. So grateful for all the contributors out there.",
  "Debugging is like being a detective in a crime movie where you're also the murderer. #programming #humor",
  "Beautiful hike today! Nature is the best way to clear your mind. #hiking #outdoors #nature",
  "Started learning Rust this week. The borrow checker is... something else. #rust #learning",
  "Happy Friday everyone! What are your weekend plans? #friday #weekend",
];

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltStr = btoa(String.fromCharCode(...salt));
  return `${saltStr}:${hash}`;
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]+/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export async function seed(db: DB, domain: string) {
  console.log("Seeding database...");

  const createdActors: { id: number; username: string }[] = [];

  // Create users and actors
  for (const userData of users) {
    // Check if user already exists
    if (await db.getUserByUsername(userData.username)) {
      console.log(`User ${userData.username} already exists, skipping...`);
      const actor = await db.getActorByUsername(userData.username);
      if (actor) {
        createdActors.push({ id: actor.id, username: userData.username });
      }
      continue;
    }

    const passwordHash = await hashPassword(userData.password);
    const user = await db.createUser(userData.username, passwordHash);

    const actorUri = `https://${domain}/users/${userData.username}`;
    const actor = await db.createActor({
      uri: actorUri,
      handle: `@${userData.username}@${domain}`,
      name: userData.name,
      bio: userData.bio,
      avatar_url: userData.avatar_url,
      inbox_url: `https://${domain}/users/${userData.username}/inbox`,
      shared_inbox_url: `https://${domain}/inbox`,
      url: `https://${domain}/@${userData.username}`,
      user_id: user.id,
    });

    createdActors.push({ id: actor.id, username: userData.username });
    console.log(`Created user: ${userData.username} (${userData.name})`);
  }

  // Create posts
  let postCount = 0;
  for (const content of posts) {
    // Assign to a random user
    const randomActor = createdActors[Math.floor(Math.random() * createdActors.length)];

    const noteId = crypto.randomUUID();
    const noteUri = `https://${domain}/users/${randomActor.username}/posts/${noteId}`;
    const noteUrl = `https://${domain}/@${randomActor.username}/posts/${noteId}`;

    const safeContent = `<p>${content}</p>`;

    const post = await db.createPost({
      uri: noteUri,
      actor_id: randomActor.id,
      content: safeContent,
      url: noteUrl,
      in_reply_to_id: null,
      sensitive: false,
    });

    // Extract and add hashtags
    const hashtags = extractHashtags(content);
    for (const tag of hashtags) {
      const hashtag = await db.getOrCreateHashtag(tag);
      await db.addPostHashtag(post.id, hashtag.id);
    }

    postCount++;
  }
  console.log(`Created ${postCount} posts`);

  // Create some follow relationships
  // Everyone follows Alice, Bob follows Carol, Carol follows Dave, etc.
  const followPairs = [
    ["bob", "alice"],
    ["carol", "alice"],
    ["dave", "alice"],
    ["eve", "alice"],
    ["bob", "carol"],
    ["carol", "dave"],
    ["dave", "eve"],
    ["eve", "bob"],
    ["alice", "eve"],
  ];

  for (const [followerName, followingName] of followPairs) {
    const follower = createdActors.find(a => a.username === followerName);
    const following = createdActors.find(a => a.username === followingName);

    if (follower && following) {
      await db.addFollow(follower.id, following.id);
    }
  }
  console.log(`Created ${followPairs.length} follow relationships`);

  console.log("\nSeeding complete!");
  console.log("\nTest accounts (all passwords match username + '123'):");
  for (const user of users) {
    console.log(`  - ${user.username}: ${user.password}`);
  }
}

// Run if called directly
if (import.meta.main) {
  const db = new DB(DATABASE_URL);
  await db.init(new URL("../schema.pg.sql", import.meta.url).pathname);
  await seed(db, DOMAIN);
  Deno.exit(0);
}
