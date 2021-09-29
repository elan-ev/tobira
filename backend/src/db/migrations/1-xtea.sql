-- Create a "pseudo-encryption" function to generate random-looking IDs
-- from standard sequential ones. This is done using a simple Feistel cipher.
-- Being a block cipher, this constitutes a permutation of its input
-- (here `bigint`, i.e. $[-2^63, 2^63) \cap \mathbb{N}$).
-- If we feed it sequential numbers, we get random looking numbers back,
-- but we are still guaranteed to never get the same number twice.

-- The specific cipher used here is the XTEA algorithm,
-- mostly because it comes recommended by the PostgreSQL-Wiki
-- for 64-bit keys.

-- Sources:
-- - https://wiki.postgresql.org/index.php?title=Pseudo_encrypt&oldid=34877
-- - https://wiki.postgresql.org/index.php?title=XTEA_(crypt_64_bits)&oldid=28771

/*
PostgreSQL Database Management System (formerly known as Postgres, then as Postgres95)

Portions Copyright (c) 1996-2008, The PostgreSQL Global Development Group

Portions Copyright (c) 1994, The Regents of the University of California

Permission to use, copy, modify, and distribute this software and its documentation for any purpose,
without fee, and without a written agreement is hereby granted, provided that the above copyright
notice and this paragraph and the following two paragraphs appear in all copies.

IN NO EVENT SHALL THE UNIVERSITY OF CALIFORNIA BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT, SPECIAL,
INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS, ARISING OUT OF THE USE OF THIS
SOFTWARE AND ITS DOCUMENTATION, EVEN IF THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE SOFTWARE
PROVIDED HEREUNDER IS ON AN "AS IS" BASIS, AND THE UNIVERSITY OF CALIFORNIA HAS NO OBLIGATIONS TO
PROVIDE MAINTENANCE, SUPPORT, UPDATES, ENHANCEMENTS, OR MODIFICATIONS.
*/

/*
   Encrypts a bigint/int8 (8 bytes) with the XTEA block cipher.
   Arguments:
      - int8 (bigint) value to encrypt/decrypt
      - bytea encryption key, 16 bytes long
        OR array of four integers: int4[4]
      - direction: true to encrypt, false to decrypt

   - Encrypt usage first option (with encryption key as bytea):
     select xtea(1234, bytea '\x1234567890ABC0ffeeFaceC0ffeeFeed', true);
   - Corresponding decrypt usage:
     select xtea(-7937660076067879872, bytea '\x1234567890ABC0ffeeFaceC0ffeeFeed', false);

   - Encrypt usage second option (with encryption key as int4[4]):
     select xtea(1234,
                 array[305419896,-1867792129,-285552960,-1114387]::int[],
                 true);
   - Corresponding decrypt usage:
     select xtea(-7937660076067879872,
                 array[305419896,-1867792129,-285552960,-1114387]::int[],
                 false);

   As each value encrypts into another unique value (given an encryption
   key), this may be used to obfuscate an int8 primary key without loosing
   the unicity property.

   The binary encryption key is equivalent to the big-endian representation
   of 4 consecutive signed integers in the int4[] array.

   plpgsql implementation by Daniel Vérité.
   Based on C code from David Wheeler and Roger Needham.
   source:  https://en.wikipedia.org/wiki/XTEA

   The plpgsql code is more complex than its C counterpart because it emulates
   unsigned 32 bits integers and modulo 32-bit arithmetic with the bigint type.
*/
create or replace function xtea(val bigint, cr_key bytea, encrypt boolean)
returns bigint as $$
declare
  bk int[4];
  b bigint; -- unsigned 32 bits
begin
  if octet_length(cr_key)<>16 then
     raise exception 'XTEA crypt key must be 16 bytes long.';
  end if;
  for i in 1..4 loop
    b:=0;
    for j in 0..3 loop
      -- interpret cr_key as 4 big-endian signed 32 bits numbers
      b:= (b<<8) | get_byte(cr_key, (i-1)*4+j);
    end loop;
    bk[i] := case when b>2147483647 then b-4294967296 else b end;
  end loop;
  return xtea(val, bk, encrypt);
end
$$ immutable language plpgsql;

create function xtea(val bigint, key128 int4[4], encrypt boolean)
returns bigint as $$
declare
  -- we use bigint (int8) to implement unsigned 32 bits with modulo 32 arithmetic
  -- (in C, uint32_t is used but pg's int4 is signed and would overflow).
  -- the most significant halves of v0,v1,_sum must always be zero
  -- they're AND'ed with 0xffffffff after every operation
  v0 bigint;
  v1 bigint;
  _sum bigint:=0;
  cr_key bigint[4]:=array[
     case when key128[1]<0 then key128[1]+4294967296 else key128[1] end,
     case when key128[2]<0 then key128[2]+4294967296 else key128[2] end,
     case when key128[3]<0 then key128[3]+4294967296 else key128[3] end,
     case when key128[4]<0 then key128[4]+4294967296 else key128[4] end
   ];
begin
  v0 := (val>>32)&4294967295;
  v1 := val&4294967295;
  IF encrypt THEN
    FOR i in 0..63 LOOP
      v0 := (v0 + ((
         ((v1<<4)&4294967295 # (v1>>5))
           + v1)&4294967295
           #
           (_sum + cr_key[1+(_sum&3)::int])&4294967295
           ))&4294967295;
      _sum := (_sum + 2654435769) & 4294967295;
      v1 := (v1 + ((
             ((v0<<4)&4294967295 # (v0>>5))
           + v0)&4294967295
          #
          (_sum + cr_key[1+((_sum>>11)&3)::int])&4294967295
          ))&4294967295;
    END LOOP;
  ELSE
    _sum := (2654435769 * 64)&4294967295;
    FOR i in 0..63 LOOP
      v1 := (v1 - ((
          ((v0<<4)&4294967295 # (v0>>5))
          + v0)&4294967295
          #
          (_sum + cr_key[1+((_sum>>11)&3)::int])&4294967295
          ))&4294967295;

      _sum := (_sum - 2654435769)& 4294967295;

      v0 := (v0 - ((
         ((v1<<4)&4294967295 # (v1>>5))
           + v1)&4294967295
           #
           (_sum + cr_key[1+(_sum&3)::int])&4294967295
           ))&4294967295;

    END LOOP;
  END IF;
  return (v0<<32)|v1;
end
$$ immutable strict language plpgsql;
