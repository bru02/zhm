drop table if exists DogColor, Color, Dog, Breed, Owner;

-- //dogID BreedID

create table Owner(
    OwnerId int not null primary key,
    AgeClassification varchar(6) not null,
    Gender varchar(1) not null check (Gender in ('f', 'm')),
    District int not null

);

create table Breed(
    BreedId int identity not null primary key,
    BreedName varchar(100) not null
);

create table Dog (
    DogId int identity not null primary key ,
    BirthYear int not null,
    Gender varchar(1) not null check (Gender in ('f', 'm')),
    Colors varchar(100) not null,
    OwnerId int not null foreign key REFERENCES Owner(OwnerId),
    BreedId int not null foreign key REFERENCES Breed(BreedId)
);


insert into Breed(BreedName)
select distinct trim(breed_dog)
    from dogs;

insert into Owner (ownerid, ageclassification, gender, district)
select distinct id_owner, age_owner, gender_owner, district_owner
    from dogs;


insert into Dog (birthyear, gender, colors, ownerid, breedid)
select distinct birthyear_dog, gender_dog, color_dog, id_owner, BreedId
    from dogs join Breed on dogs.breed_dog = BreedName

;create table Color(
    ColorId int identity primary key ,
    ColorName varchar(max)
 )

create table DogColor (
    ColorId int foreign key REFERENCES Color(ColorId),
    DogId int foreign key REFERENCES Dog(DogId),
    primary key (ColorId,DogId)
)

insert into Color(ColorName)
select distinct replace(value, ' ', '')
    from dogs
    cross apply string_split(color_dog, '/')

insert into DogColor(colorid, dogid)
select distinct ColorId, DogId
    from dogs
    cross apply string_split(color_dog, '/')
    join Color on replace(value, ' ', '') = ColorName
    join Dog on Dog.BirthYear = dogs.birthyear_dog and Dog.Colors = dogs.color_dog and Dog.Gender = dogs.gender_dog

GO;
create or alter function gender(@letter varchar(1))
    returns varchar(10)
as begin
    return case
        when @letter = 'f' then 'female'
        when @letter = 'm' then 'male'
        end
end;
GO;

--desc!
;

select count(*)
    from Dog
    group by dbo.gender(Gender)
    order by count(*) desc

Go;
create or alter view vwDogGenderCount as (
select top 2 count(*) as CountofGenders
    from Dog
    group by dbo.gender(Gender)
    order by count(*) desc

                                         );
Go;

select
    DogId as [@id],
    BirthYear,
    dbo.gender(Gender) as Gender,
    B.BreedName,
    (select Owner.OwnerId, AgeClassification as AgeClass, District, dbo.gender(Owner.Gender) as Gender
         from Owner
         where Dog.OwnerId = Owner.OwnerId
         for xml path ('Owner'), TYPE)
    from Dog
    join Breed B on Dog.BreedId = B.BreedId
    for xml path('Dog'), ROOT ('Dogs')


/*select distinct Male, Female from (select (
        select count(*)
        from Dog
        where dbo.gender(Gender) = 'male'

               ) as Male,
        ((
        select count(*)
        from Dog
        where dbo.gender(Gender) = 'male'

               )) as Female
        from Dog) as T;

GO;
create or alter view vwDogGenderCount as(
    select * from ()
    )
Go;*/