"""对象存储（MinIO，走 S3 协议）。boto3 是同步的，异步代码里用 run_in_threadpool 调用。"""

from functools import lru_cache
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from .config import get_settings


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
