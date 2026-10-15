#!/usr/bin/env python3
"""Private online application backups. Never restores or changes clinic data."""
from pathlib import Path
import datetime, fcntl, gzip, hashlib, json, os, re, shutil, subprocess, tarfile, tempfile

PROJECT = Path('/home/ubuntu/unavet/app')
BASE = Path('/var/backups/unavet')
KEEP = 7

def run(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        (BASE/'last-error.log').write_text(result.stderr, encoding='utf-8')
        raise RuntimeError(f'{Path(args[0]).name} failed; inspect the private last-error.log')
    return result.stdout.strip()

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''): digest.update(block)
    return digest.hexdigest()

def backup():
    containers = run(['docker','compose','--project-directory',str(PROJECT),'ps','--all','--quiet','app']).splitlines()
    if len(containers) != 1: raise RuntimeError('Expected the existing app container')
    info = json.loads(run(['docker','inspect',containers[0]]))[0]
    env = dict(value.split('=',1) for value in info['Config']['Env'] if '=' in value)
    database = env.get('DB_NAME','')
    if not re.fullmatch(r'[A-Za-z0-9_]+',database): raise RuntimeError('Invalid configured database name')
    # Socket authentication on the host avoids copying passwords into commands.
    engines = run(['mysql','--user=root','--protocol=SOCKET','--batch','--skip-column-names',
        '--execute',f"SELECT DISTINCT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='{database}' AND TABLE_TYPE='BASE TABLE'"])
    if engines.splitlines() != ['InnoDB']: raise RuntimeError('Online consistent backup requires InnoDB tables')
    media = [Path(m['Source']) for m in info['Mounts'] if m['Destination']=='/app/backend/storage/media']
    if len(media)!=1 or not media[0].is_dir(): raise RuntimeError('Media volume not found')
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    archive = BASE/f'unavet-{timestamp}.tar.gz'
    partial = BASE/(archive.name+'.partial')
    free = shutil.disk_usage(BASE).free
    if free < 1024**3: raise RuntimeError('Less than 1 GiB available; existing backups retained')
    try:
        with tempfile.TemporaryDirectory(prefix='.work-',dir=BASE) as work:
            work = Path(work)
            sql = work/'database.sql'
            run(['mysqldump','--user=root','--protocol=SOCKET','--single-transaction','--quick',
                '--routines','--events','--triggers','--hex-blob','--no-tablespaces',
                '--set-gtid-purged=OFF','--default-character-set=utf8mb4',
                '--result-file='+str(sql),'--databases',database])
            if sql.stat().st_size==0: raise RuntimeError('Empty database dump')
            table_count = int(run(['mysql','--user=root','--protocol=SOCKET','--batch','--skip-column-names',
                '--execute',f"SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='{database}' AND TABLE_TYPE='BASE TABLE'"]))
            with sql.open('r',encoding='utf-8') as dump:
                definitions = sum(line.startswith('CREATE TABLE ') for line in dump)
            if definitions != table_count: raise RuntimeError('Database table definitions did not match the schema')
            manifest = {'createdAtUtc':timestamp,'databaseTables':table_count,'sqlSha256':sha(sql),
                'databaseMethod':'mysqldump single-transaction','mediaConsistency':'Live filesystem copy',
                'image':info['Image'],'retentionCopies':KEEP,'offsiteCopy':False}
            (work/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
            excluded = {'node_modules','.git','tmp','dist','build','output','__pycache__','.codex_doc_deps'}
            def app_filter(member):
                parts = Path(member.name).parts
                if any(part in excluded for part in parts): return None
                if member.name.startswith(('app/backend/backups','app/backend/storage')): return None
                return member
            with tarfile.open(partial,'w:gz',compresslevel=6) as tar:
                tar.add(sql,arcname='database.sql')
                tar.add(work/'manifest.json',arcname='manifest.json')
                tar.add(PROJECT,arcname='app',filter=app_filter)
                tar.add(media[0],arcname='media')
                tar.add('/etc/caddy/Caddyfile',arcname='host/Caddyfile')
                tar.add('/etc/mysql',arcname='host/mysql')
                tar.add('/usr/local/sbin/unavet-backup.py',arcname='host/unavet-backup.py')
                tar.add('/etc/systemd/system/unavet-backup.service',arcname='host/unavet-backup.service')
                tar.add('/etc/systemd/system/unavet-backup.timer',arcname='host/unavet-backup.timer')
            # Read every archived byte before publishing the copy or rotating older ones.
            with gzip.open(partial,'rb') as stream:
                while stream.read(1024*1024): pass
            with tarfile.open(partial,'r:gz') as tar:
                names = set()
                for member in tar:
                    names.add(member.name)
                    if member.isfile():
                        stream = tar.extractfile(member)
                        while stream.read(1024*1024): pass
                if not {'database.sql','manifest.json','app/compose.yaml','media','host/Caddyfile'} <= names:
                    raise RuntimeError('Incomplete backup archive')
            digest = sha(partial)
            partial.replace(archive)
            checksum = BASE/(archive.name+'.sha256')
            checksum.write_text(f'{digest}  {archive.name}\n',encoding='ascii')
            status = {'success':True,'createdAtUtc':timestamp,'archive':archive.name,
                'bytes':archive.stat().st_size,'databaseTables':table_count,'sha256':digest}
            (BASE/'last-success.json').write_text(json.dumps(status,indent=2),encoding='utf-8')
            # Only this job's completed archives are eligible for rotation.
            completed = sorted(p for p in BASE.iterdir() if re.fullmatch(r'unavet-\d{8}T\d{6}Z\.tar\.gz',p.name) and p.is_file() and not p.is_symlink())
            for old in completed[:-KEEP]:
                if old.parent.resolve()!=BASE.resolve(): raise RuntimeError('Unsafe retention path')
                old.unlink()
                old.with_name(old.name+'.sha256').unlink(missing_ok=True)
            (BASE/'last-error.log').unlink(missing_ok=True)
            print(f'Backup verified: {archive.name}; tables={table_count}; bytes={archive.stat().st_size}')
    finally:
        partial.unlink(missing_ok=True)

if __name__=='__main__':
    os.umask(0o077)
    BASE.mkdir(mode=0o700,parents=True,exist_ok=True)
    BASE.chmod(0o700)
    with (BASE/'.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try: backup()
        except Exception as error:
            (BASE/'last-failure.json').write_text(json.dumps({'success':False,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'error':str(error)}),encoding='utf-8')
            raise SystemExit(str(error))
