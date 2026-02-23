const credentialsResponse = await fetch(
  `http://169.254.170.2${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`,
);
const credentials = (await credentialsResponse.json()) as {
  AccessKeyId: string;
  SecretAccessKey: string;
  Token: string;
};
const github = {
  username: process.env.GITHUB_USERNAME,
  repository: process.env.GITHUB_REPOSITORY,
};

Bun.env.AWS_ACCESS_KEY_ID = credentials.AccessKeyId;
Bun.env.AWS_SECRET_ACCESS_KEY = credentials.SecretAccessKey;
Bun.env.AWS_SESSION_TOKEN = credentials.Token;

await Bun.$`gh repo clone ${github.username}/${github.repository} ~/${github.repository}`;

await Bun.$`claude --dangerously-skip-permissions -p ${process.env.PROMPT}`.cwd(
  `${process.env.HOME}/${github.repository}`,
);

process.exit(0);
