import { DB } from "./db.ts";
import { CommunityDB } from "./communities/db.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://riff:riff@localhost:5432/riff";
const DOMAIN = Deno.env.get("DOMAIN") || "localhost:8000";

// Sample users with profiles
const users = [
  {
    username: "alice",
    email: "alice@alice.com",
    password: "alicepassword",
    name: "Alice Johnson",
    bio: "Software developer and open source enthusiast. Love building things with TypeScript and Rust.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
  },
  {
    username: "bob",
    email: "bob@bob.com",
    password: "bobpassword",
    name: "Bob Smith",
    bio: "Photographer and nature lover. Sharing moments from my adventures around the world.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
  },
  {
    username: "carol",
    email: "carol@carol.com",
    password: "carolpassword",
    name: "Carol Williams",
    bio: "Writer, coffee addict, and cat person. Currently working on my first novel.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=carol",
  },
  {
    username: "dave",
    email: "dave@dave.com",
    password: "davepassword",
    name: "Dave Chen",
    bio: "Music producer and DJ. Electronic music is my passion. Check out my latest mixes!",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=dave",
  },
  {
    username: "eve",
    email: "eve@eve.com",
    password: "evepassword",
    name: "Eve Martinez",
    bio: "Security researcher and privacy advocate. Decentralization is the future!",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=eve",
  },
  {
    username: "frank",
    email: "frank@frank.com",
    password: "frankpassword",
    name: "Frank Wilson",
    bio: "Game developer and pixel art enthusiast. Making indie games in my spare time.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=frank",
  },
  {
    username: "grace",
    email: "grace@grace.com",
    password: "gracepassword",
    name: "Grace Lee",
    bio: "Data scientist by day, baker by night. Love finding patterns in everything.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=grace",
  },
  {
    username: "henry",
    email: "henry@henry.com",
    password: "henrypassword",
    name: "Henry Taylor",
    bio: "Retro computing collector. If it has a CRT, I probably want it.",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=henry",
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
  "Just set up my home server. Self-hosting is addictive! #selfhosted #homelab",
  "Anyone else excited about WebAssembly? The possibilities are endless. #wasm #webdev",
  "Made sourdough bread for the first time. It actually turned out edible! #baking #cooking",
  "Late night coding session. The bugs come out at night. #programming #nightowl",
  "Attended a great tech meetup today. Love connecting with fellow developers! #community #networking",
];

// Communities to create
const communities = [
  {
    name: "programming",
    bio: "Discuss programming languages, tools, and best practices. All skill levels welcome!",
    requireApproval: false,
  },
  {
    name: "gaming",
    bio: "Video games, board games, tabletop RPGs - if it's a game, we talk about it here.",
    requireApproval: false,
  },
  {
    name: "photography",
    bio: "Share your photos and discuss techniques, gear, and editing workflows.",
    requireApproval: false,
  },
  {
    name: "music",
    bio: "For musicians, producers, and music lovers. Share what you're listening to or working on!",
    requireApproval: false,
  },
  {
    name: "selfhosted",
    bio: "Running your own services? Share tips, setups, and help others get started.",
    requireApproval: false,
  },
];

// Community-specific posts
const communityPosts: Record<string, string[]> = {
  programming: [
    "What's everyone's favorite code editor these days? I've been using VS Code but thinking about trying Zed.",
    "Just discovered pattern matching in Python 3.10+. Game changer for parsing complex data structures!",
    "Hot take: tabs are better than spaces because they're accessible - people can set their own preferred width.",
    "Working on a new #Rust project. The compiler errors are actually helpful once you learn to read them.",
    "Anyone have experience with htmx? Thinking about using it for my next project instead of a heavy JS framework.",
    "TIL about the nullish coalescing operator (??) in JavaScript. Where has this been all my life?",
    "What's your go-to testing framework? I've been using Vitest and really enjoying it.",
  ],
  gaming: [
    "Finally beat that boss I've been stuck on for a week. The feeling of victory is real!",
    "Looking for co-op game recommendations. Something my partner and I can play together.",
    "Unpopular opinion: I actually enjoy grinding in RPGs. It's relaxing.",
    "The indie game scene is incredible right now. So many creative titles coming out.",
    "Anyone playing the new expansion? No spoilers please, I'm only halfway through!",
    "Board game night was a success! Introduced my friends to Wingspan and they loved it.",
    "Retro gaming question: what's the best way to play old console games on modern TVs?",
  ],
  photography: [
    "Golden hour never disappoints. Caught some amazing light this evening.",
    "Finally upgraded to a full-frame camera. The difference in low light is incredible.",
    "Street photography tip: confidence is key. Act like you belong and people won't question you.",
    "What's everyone's favorite photo editing software? I'm trying to move away from subscriptions.",
    "Film vs digital debate aside, there's something magical about waiting for your rolls to be developed.",
    "Macro photography is humbling. There's a whole world we walk past every day without noticing.",
    "Print your photos! There's nothing like seeing your work on paper instead of just screens.",
  ],
  music: [
    "New synth day! Just got a Minilogue XD and I'm already lost in the presets.",
    "What DAW is everyone using? I've been on Ableton for years but curious about others.",
    "Learning music theory has completely changed how I approach songwriting. Wish I'd started sooner.",
    "Anyone else make music just for themselves? Not everything needs to be released.",
    "The algorithm recommended an obscure album from 1973 and now it's all I can listen to.",
    "Hot take: hardware synths are overrated. Plugins sound just as good for most purposes.",
    "Collaboration is magic. Working with other musicians always pushes me in new directions.",
  ],
  selfhosted: [
    "Just migrated everything to Docker Compose. So much cleaner than managing services manually.",
    "What's everyone using for backups? I need a solid 3-2-1 backup strategy.",
    "Home Assistant has taken over my house. My partner is both impressed and concerned.",
    "Running a small Mastodon instance for friends. Federation is beautiful when it works.",
    "PSA: Always check your firewall rules after updates. Ask me how I learned this.",
    "Nextcloud vs alternatives - what's everyone running for file sync these days?",
    "The electricity bill for my homelab is getting concerning but I regret nothing.",
  ],
};

// Replies to posts
const replies = [
  "Totally agree with this!",
  "Interesting perspective, I hadn't thought about it that way.",
  "This is exactly what I needed to hear today.",
  "Could you share more details? I'd love to learn more.",
  "Same experience here! Glad I'm not the only one.",
  "Great point! I'll have to try this.",
  "Haha, so relatable!",
  "Thanks for sharing this!",
  "Bookmarking this for later.",
  "This made my day!",
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

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function seed(db: DB, domain: string) {
  console.log("Seeding database...");

  const communityDb = new CommunityDB(db.getPool());
  const createdActors: { id: number; username: string }[] = [];
  const createdPosts: { id: number; actorId: number }[] = [];

  // Create users and actors
  console.log("\n--- Creating users ---");
  for (const userData of users) {
    // Check if user already exists
    const existingUser = await db.getUserByUsername(userData.username);
    if (existingUser) {
      console.log(`User ${userData.username} already exists, updating email...`);
      // Update email if not set
      if (!existingUser.email) {
        await db.updateUserEmail(existingUser.id, userData.email);
      }
      const actor = await db.getActorByUsername(userData.username);
      if (actor) {
        createdActors.push({ id: actor.id, username: userData.username });
      }
      continue;
    }

    const passwordHash = await hashPassword(userData.password);
    const user = await db.createUser(userData.username, passwordHash, userData.email);

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
      actor_type: "Person",
    });

    createdActors.push({ id: actor.id, username: userData.username });
    console.log(`  Created: ${userData.username} (${userData.name})`);
  }

  // Create general posts
  console.log("\n--- Creating posts ---");
  for (const content of posts) {
    const randomActor = randomChoice(createdActors);
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

    createdPosts.push({ id: post.id, actorId: randomActor.id });

    // Extract and add hashtags
    const hashtags = extractHashtags(content);
    for (const tag of hashtags) {
      const hashtag = await db.getOrCreateHashtag(tag);
      await db.addPostHashtag(post.id, hashtag.id);
    }
  }
  console.log(`  Created ${posts.length} general posts`);

  // Create communities
  console.log("\n--- Creating communities ---");
  const createdCommunities: { id: number; name: string }[] = [];
  for (const community of communities) {
    const existing = await communityDb.getCommunityByName(community.name);
    if (existing) {
      console.log(`  Community ${community.name} already exists, skipping...`);
      createdCommunities.push({ id: existing.id, name: community.name });
      continue;
    }

    // Random user creates the community
    const creator = randomChoice(createdActors);
    const created = await communityDb.createCommunity(
      community.name,
      domain,
      creator.id,
      { bio: community.bio, requireApproval: community.requireApproval }
    );
    createdCommunities.push({ id: created.id, name: community.name });
    console.log(`  Created: c/${community.name} (by ${creator.username})`);

    // Add some random members
    const members = randomSubset(createdActors.filter(a => a.id !== creator.id), 3, 6);
    for (const member of members) {
      await db.addFollow(member.id, created.id);
    }
    console.log(`    Added ${members.length} members`);
  }

  // Create community posts
  console.log("\n--- Creating community posts ---");
  for (const community of createdCommunities) {
    const postsForCommunity = communityPosts[community.name] || [];
    const members = await communityDb.getMembers(community.id, 50);

    for (const content of postsForCommunity) {
      if (members.length === 0) continue;
      const randomMember = randomChoice(members);
      const noteId = crypto.randomUUID();
      const noteUri = `https://${domain}/users/${randomMember.handle?.split("@")[1]}/posts/${noteId}`;
      const noteUrl = `https://${domain}/@${randomMember.handle?.split("@")[1]}/posts/${noteId}`;
      const safeContent = `<p>${content}</p>`;

      const post = await db.createPost({
        uri: noteUri,
        actor_id: randomMember.id,
        content: safeContent,
        url: noteUrl,
        in_reply_to_id: null,
        sensitive: false,
      });

      await communityDb.submitCommunityPost(community.id, post.id, true);
      createdPosts.push({ id: post.id, actorId: randomMember.id });

      // Extract and add hashtags
      const hashtags = extractHashtags(content);
      for (const tag of hashtags) {
        const hashtag = await db.getOrCreateHashtag(tag);
        await db.addPostHashtag(post.id, hashtag.id);
      }
    }
    console.log(`  Added ${postsForCommunity.length} posts to c/${community.name}`);
  }

  // Create some replies
  console.log("\n--- Creating replies ---");
  let replyCount = 0;
  const postsToReplyTo = randomSubset(createdPosts, 10, 15);
  for (const parentPost of postsToReplyTo) {
    const numReplies = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numReplies; i++) {
      const replier = randomChoice(createdActors.filter(a => a.id !== parentPost.actorId));
      const content = randomChoice(replies);
      const noteId = crypto.randomUUID();
      const noteUri = `https://${domain}/users/${replier.username}/posts/${noteId}`;
      const noteUrl = `https://${domain}/@${replier.username}/posts/${noteId}`;

      await db.createPost({
        uri: noteUri,
        actor_id: replier.id,
        content: `<p>${content}</p>`,
        url: noteUrl,
        in_reply_to_id: parentPost.id,
        sensitive: false,
      });
      replyCount++;
    }
  }
  console.log(`  Created ${replyCount} replies`);

  // Add likes
  console.log("\n--- Adding likes ---");
  let likeCount = 0;
  for (const post of createdPosts) {
    const likers = randomSubset(createdActors.filter(a => a.id !== post.actorId), 0, 5);
    for (const liker of likers) {
      try {
        await db.addLike(liker.id, post.id);
        likeCount++;
      } catch {
        // Ignore duplicate likes
      }
    }
  }
  console.log(`  Added ${likeCount} likes`);

  // Create follow relationships
  console.log("\n--- Creating follows ---");
  const followPairs: [string, string][] = [
    ["bob", "alice"],
    ["carol", "alice"],
    ["dave", "alice"],
    ["eve", "alice"],
    ["frank", "alice"],
    ["grace", "alice"],
    ["henry", "alice"],
    ["bob", "carol"],
    ["carol", "dave"],
    ["dave", "eve"],
    ["eve", "bob"],
    ["alice", "eve"],
    ["frank", "bob"],
    ["grace", "carol"],
    ["henry", "dave"],
    ["alice", "frank"],
    ["bob", "grace"],
    ["carol", "henry"],
  ];

  let followCount = 0;
  for (const [followerName, followingName] of followPairs) {
    const follower = createdActors.find(a => a.username === followerName);
    const following = createdActors.find(a => a.username === followingName);

    if (follower && following) {
      try {
        await db.addFollow(follower.id, following.id);
        followCount++;
      } catch {
        // Ignore duplicate follows
      }
    }
  }
  console.log(`  Created ${followCount} follow relationships`);

  console.log("\n========================================");
  console.log("Seeding complete!");
  console.log("========================================");
  console.log("\nTest accounts (password = username + 'password'):");
  for (const user of users) {
    console.log(`  ${user.email} / ${user.password}`);
  }
  console.log("\nCommunities:");
  for (const community of communities) {
    console.log(`  c/${community.name}`);
  }
}

// Run if called directly
if (import.meta.main) {
  const db = new DB(DATABASE_URL);
  await db.init(new URL("../schema.pg.sql", import.meta.url).pathname);
  await seed(db, DOMAIN);
  Deno.exit(0);
}
