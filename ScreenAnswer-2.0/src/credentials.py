"""Encrypt API keys with the current Windows user's DPAPI account."""
import ctypes as C
from ctypes import wintypes as W

class Blob(C.Structure):
    _fields_ = [('size', W.DWORD), ('data', C.POINTER(C.c_ubyte))]

def protect(data, decrypt=False):
    raw = C.create_string_buffer(data)
    source = Blob(len(data), C.cast(raw, C.POINTER(C.c_ubyte)))
    result = Blob()
    api = C.windll.crypt32.CryptUnprotectData if decrypt else C.windll.crypt32.CryptProtectData
    api.argtypes = [C.POINTER(Blob), C.c_void_p, C.c_void_p, C.c_void_p, C.c_void_p, W.DWORD, C.POINTER(Blob)]
    api.restype = W.BOOL
    if not api(C.byref(source), None, None, None, None, 1, C.byref(result)):
        raise C.WinError()
    try:
        return C.string_at(result.data, result.size)
    finally:
        C.windll.kernel32.LocalFree.argtypes = [C.c_void_p]
        C.windll.kernel32.LocalFree(C.cast(result.data, C.c_void_p))
