-- The shape of a board image (width over height), so the collage can lay it
-- out before the image loads, on every device. Null until it is measured.

alter table board_item add column aspect numeric;
