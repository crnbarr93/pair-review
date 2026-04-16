import { execa } from 'execa';

export async function inferRepoFromCwd(
  cwd: string
): Promise<{ owner: string; name: string }> {
  try {
    const { stdout } = await execa('gh', ['repo', 'view', '--json', 'name,owner'], {
      cwd,
    });
    const parsed = JSON.parse(stdout) as { name: string; owner: { login: string } };
    if (!parsed?.owner?.login || !parsed?.name) {
      throw new Error('gh repo view returned unexpected shape');
    }
    return { owner: parsed.owner.login, name: parsed.name };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(
        `Couldn't infer repo from current directory (${cwd}). Pass the full PR URL instead.`
      );
    }
    throw err;
  }
}
