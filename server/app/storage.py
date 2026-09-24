"""对象存储（MinIO，走 S3 协议）。

boto3 是同步的：路由里用 run_in_threadpool 调用，下载用同步迭代器交给 StreamingResponse。
测试里用 InMemoryObjectStore 替换（见 get_object_store）。
"""

from collections.abc import Iterable, Iterator
from functools import lru_cache
from typing import Any, BinaryIO, Protocol

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from .config import get_settings


class ObjectStore(Protocol):
    def put(self, key: str, body: BinaryIO, content_type: str) -> None: ...
    def iter_chunks(self, key: str) -> Iterator[bytes]: ...
    def delete_many(self, keys: Iterable[str]) -> None: ...


@lru_cache
def get_s3() -> Any:
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        region_name=s.s3_region,
        # MinIO 用路径风格：http://minio:9000/<bucket>/<key>
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


class S3ObjectStore:
    def __init__(self, bucket: str) -> None:
        self.bucket = bucket

    def put(self, key: str, body: BinaryIO, content_type: str) -> None:
        get_s3().upload_fileobj(body, self.bucket, key, ExtraArgs={"ContentType": content_type})

    def iter_chunks(self, key: str) -> Iterator[bytes]:
        obj = get_s3().get_object(Bucket=self.bucket, Key=key)
        yield from obj["Body"].iter_chunks(chunk_size=256 * 1024)

    def delete_many(self, keys: Iterable[str]) -> None:
        keys = list(keys)
        # DeleteObjects 一次最多 1000 个
        for i in range(0, len(keys), 1000):
            batch = [{"Key": k} for k in keys[i : i + 1000]]
            get_s3().delete_objects(Bucket=self.bucket, Delete={"Objects": batch, "Quiet": True})


class InMemoryObjectStore:
    """测试用"""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, body: BinaryIO, content_type: str) -> None:
        self.objects[key] = (body.read(), content_type)

    def iter_chunks(self, key: str) -> Iterator[bytes]:
        yield self.objects[key][0]

    def delete_many(self, keys: Iterable[str]) -> None:
        for k in keys:
            self.objects.pop(k, None)


@lru_cache
def get_object_store() -> ObjectStore:
    return S3ObjectStore(get_settings().s3_bucket)


def ensure_bucket() -> None:
    """桶不存在就创建。启动时调用。"""
    s3 = get_s3()
    bucket = get_settings().s3_bucket
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        s3.create_bucket(Bucket=bucket)


def check_storage() -> None:
    get_s3().head_bucket(Bucket=get_settings().s3_bucket)
